// Knowledge graph service — entities + relations.
//
// Entities are nodes: people, places, projects, topics, habits, media, orgs.
// Relations are weighted edges. Used to answer "who's in my life", "what
// matters", "who haven't I checked in with".
//
// Contacts are mirrored as Entity(kind=person) at write time. New code should
// read from entities; the Contact model is preserved for back-compat.

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { embed, toVectorLiteral } from "../lib/embeddings.js";

export type EntityKind = "person" | "place" | "project" | "topic" | "habit" | "media" | "org";

export interface EntityRow {
  id: string;
  userId: string;
  kind: EntityKind;
  canonical: string;
  aliases: string[];
  attrs: Record<string, unknown>;
  contactId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationRow {
  id: string;
  userId: string;
  fromId: string;
  toId: string;
  kind: string;
  strength: number;
  lastEventAt: Date | null;
  createdAt: Date;
}

export interface UpsertEntityInput {
  userId: string;
  kind: EntityKind;
  canonical: string;
  aliases?: string[];
  attrs?: Record<string, unknown>;
  contactId?: string;
}

/**
 * Resolve a name to an Entity. Tries canonical match, then alias match, then
 * cosine similarity over embeddings (when name is fuzzy).
 */
export async function resolve(
  userId: string,
  name: string,
  kind?: EntityKind,
): Promise<EntityRow | null> {
  const needle = name.trim();
  if (!needle) return null;

  // Exact canonical (case-insensitive)
  const direct = await prisma.entity.findFirst({
    where: {
      userId,
      kind,
      canonical: { equals: needle, mode: "insensitive" },
    },
  });
  if (direct) return toEntity(direct);

  // Alias match
  const aliased = await prisma.entity.findFirst({
    where: {
      userId,
      kind,
      aliases: { has: needle.toLowerCase() },
    },
  });
  if (aliased) return toEntity(aliased);

  // Embedding-based fallback
  const queryEmbedding = await embed(needle);
  if (!queryEmbedding) return null;
  const vec = toVectorLiteral(queryEmbedding);

  const kindFilter = kind ? `AND kind = $3::"EntityKind"` : "";
  const args: unknown[] = [vec, userId];
  if (kind) args.push(kind);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; similarity: number }>
  >(
    `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
       FROM entities
      WHERE user_id = $2 AND embedding IS NOT NULL ${kindFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT 1`,
    ...args,
  );

  const top = rows[0];
  if (top && top.similarity >= 0.85) {
    const row = await prisma.entity.findUnique({ where: { id: top.id } });
    return row ? toEntity(row) : null;
  }
  return null;
}

/**
 * Upsert by (userId, canonical, kind). If an entity with that canonical name
 * already exists, merge aliases + attrs. Embedding is regenerated when
 * canonical changes or on first write.
 */
export async function upsertEntity(input: UpsertEntityInput): Promise<EntityRow> {
  const existing = await prisma.entity.findFirst({
    where: {
      userId: input.userId,
      kind: input.kind,
      canonical: { equals: input.canonical, mode: "insensitive" },
    },
  });

  if (existing) {
    const aliases = mergeAliases(existing.aliases, input.aliases ?? []);
    const attrs = { ...(existing.attrs as Record<string, unknown>), ...(input.attrs ?? {}) };
    const updated = await prisma.entity.update({
      where: { id: existing.id },
      data: {
        aliases,
        attrs: attrs as Prisma.InputJsonValue,
        contactId: input.contactId ?? existing.contactId,
      },
    });
    return toEntity(updated);
  }

  // New entity — generate embedding and insert via raw SQL.
  const embedding = await embed(input.canonical);
  const id = cuid();
  if (embedding) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO entities
         (id, user_id, kind, canonical, aliases, attrs, embedding, contact_id, created_at, updated_at)
       VALUES ($1, $2, $3::"EntityKind", $4, $5::text[], $6::jsonb, $7::vector, $8, NOW(), NOW())`,
      id,
      input.userId,
      input.kind,
      input.canonical,
      (input.aliases ?? []).map((a) => a.toLowerCase()),
      JSON.stringify(input.attrs ?? {}),
      toVectorLiteral(embedding),
      input.contactId ?? null,
    );
  } else {
    await prisma.entity.create({
      data: {
        id,
        userId: input.userId,
        kind: input.kind,
        canonical: input.canonical,
        aliases: (input.aliases ?? []).map((a) => a.toLowerCase()),
        attrs: (input.attrs ?? {}) as Prisma.InputJsonValue,
        contactId: input.contactId ?? null,
      },
    });
  }
  const row = await prisma.entity.findUnique({ where: { id } });
  if (!row) throw new Error("entity insert succeeded but read returned null");
  return toEntity(row);
}

/**
 * List entities for a user, optionally filtered by kind.
 */
export async function listEntities(
  userId: string,
  kind?: EntityKind,
): Promise<EntityRow[]> {
  const rows = await prisma.entity.findMany({
    where: { userId, kind },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  return rows.map(toEntity);
}

/**
 * Pulse: relationships sorted by overdue + weakness. Used by the relationship-
 * pulse background agent.
 */
export async function pulse(userId: string): Promise<
  Array<{ entity: EntityRow; lastSeenAt: Date | null; daysSince: number | null }>
> {
  // For now: people-kind entities ordered by their backing Contact's last
  // check-in (when present). Without Contact backing, we use updatedAt.
  const entities = await prisma.entity.findMany({
    where: { userId, kind: "person" },
    include: {
      // Doesn't auto-fetch contact; fetch separately to avoid Prisma include
      // hassles. KISS.
    },
  });

  const contactIds = entities
    .map((e) => e.contactId)
    .filter((id): id is string => !!id);
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
  });
  const byId = new Map(contacts.map((c) => [c.id, c]));

  return entities
    .map((e) => {
      const c = e.contactId ? byId.get(e.contactId) : undefined;
      const lastSeenAt = c?.lastCheckInAt ?? null;
      const daysSince = lastSeenAt
        ? Math.floor((Date.now() - lastSeenAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return { entity: toEntity(e), lastSeenAt, daysSince };
    })
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

/**
 * Backfill: ensure every existing Contact has a mirroring Entity.
 * Idempotent — safe to run repeatedly.
 */
export async function mirrorContactsToEntities(userId: string): Promise<number> {
  const contacts = await prisma.contact.findMany({ where: { userId } });
  let count = 0;
  for (const c of contacts) {
    const existing = await prisma.entity.findFirst({
      where: { userId, contactId: c.id },
    });
    if (existing) continue;
    await upsertEntity({
      userId,
      kind: "person",
      canonical: c.name,
      contactId: c.id,
      attrs: {
        relationshipType: c.relationshipType,
        targetFrequencyDays: c.targetFrequencyDays,
        birthday: c.birthday?.toISOString() ?? null,
      },
    });
    count++;
  }
  return count;
}

function mergeAliases(existing: string[], incoming: string[]): string[] {
  const set = new Set<string>(existing.map((a) => a.toLowerCase()));
  for (const a of incoming) set.add(a.toLowerCase());
  return [...set];
}

function toEntity(r: {
  id: string;
  userId: string;
  kind: string;
  canonical: string;
  aliases: string[];
  attrs: unknown;
  contactId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EntityRow {
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind as EntityKind,
    canonical: r.canonical,
    aliases: r.aliases,
    attrs: (r.attrs ?? {}) as Record<string, unknown>,
    contactId: r.contactId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function cuid(): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `c${rand()}${rand()}${Math.random().toString(36).slice(2, 6)}`;
}
