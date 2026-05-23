// Memory service — write, retrieve, decay.
//
// Memories are stored in the `memories` table with a pgvector embedding.
// Retrieval scores combine cosine similarity + importance + recency, so
// the LLM gets *relevant* memories, not just nearest neighbors.

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { embed, toVectorLiteral } from "../lib/embeddings.js";
import { encrypt, decrypt, isCiphertext } from "../lib/crypto.js";

export type MemoryKind =
  | "fact"
  | "preference"
  | "event"
  | "relationship"
  | "goal"
  | "value"
  | "pattern";

export interface MemoryRow {
  id: string;
  userId: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  attrs: Record<string, unknown>;
  createdAt: Date;
  lastRecalledAt: Date | null;
  decayedAt: Date | null;
}

export interface MemoryRetrieved extends MemoryRow {
  score: number;
  similarity: number;
}

export interface WriteMemoryInput {
  userId: string;
  kind: MemoryKind;
  content: string;
  source: string;
  importance?: number;
  confidence?: number;
  attrs?: Record<string, unknown>;
}

const DUPLICATE_THRESHOLD = 0.92; // cosine sim above this = treat as duplicate

/**
 * Write a memory. Embeds the content, checks for near-duplicates, and inserts.
 * Returns the new memory row, OR the existing duplicate (with reinforced importance).
 */
export async function writeMemory(input: WriteMemoryInput): Promise<MemoryRow | null> {
  const importance = input.importance ?? 0.5;
  const confidence = input.confidence ?? 0.7;
  const attrs = input.attrs ?? {};

  // Embed against the *plaintext* so semantic search works correctly. The
  // ciphertext stored in the DB has no semantic meaning.
  const embedding = await embed(input.content);
  const encryptedContent = await encryptContentForUser(input.userId, input.content);
  if (!embedding) {
    // No embedding — still write, but no semantic recall until re-embedded.
    const row = await prisma.memory.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        content: encryptedContent,
        importance,
        confidence,
        source: input.source,
        attrs: attrs as Prisma.InputJsonValue,
      },
    });
    return toRow(row, input.userId);
  }

  // Check for near-duplicate
  const vecLiteral = toVectorLiteral(embedding);
  const dups = await prisma.$queryRawUnsafe<Array<{ id: string; importance: number; similarity: number }>>(
    `SELECT id, importance, 1 - (embedding <=> $1::vector) AS similarity
       FROM memories
      WHERE user_id = $2 AND kind = $3::"MemoryKind" AND decayed_at IS NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 1`,
    vecLiteral,
    input.userId,
    input.kind,
  );

  const top = dups[0];
  if (top && top.similarity >= DUPLICATE_THRESHOLD) {
    // Reinforce existing memory rather than create a duplicate.
    const newImportance = Math.min(1, top.importance + 0.1);
    await prisma.memory.update({
      where: { id: top.id },
      data: { importance: newImportance, lastRecalledAt: new Date() },
    });
    const refreshed = await prisma.memory.findUnique({ where: { id: top.id } });
    return refreshed ? toRow(refreshed, input.userId) : null;
  }

  // No duplicate — insert via raw SQL because the vector type isn't a
  // first-class Prisma column.
  const id = cuid();
  await prisma.$executeRawUnsafe(
    `INSERT INTO memories
       (id, user_id, kind, content, embedding, importance, confidence, source, attrs, created_at)
     VALUES ($1, $2, $3::"MemoryKind", $4, $5::vector, $6, $7, $8, $9::jsonb, NOW())`,
    id,
    input.userId,
    input.kind,
    encryptedContent,
    vecLiteral,
    importance,
    confidence,
    input.source,
    JSON.stringify(attrs),
  );
  const created = await prisma.memory.findUnique({ where: { id } });
  return created ? toRow(created, input.userId) : null;
}

/**
 * Retrieve the top-K relevant memories for a query string.
 * Scoring: 0.6 * cosine + 0.3 * importance + 0.1 * recency.
 */
export async function retrieveMemories(
  userId: string,
  queryText: string,
  k = 8,
): Promise<MemoryRetrieved[]> {
  const queryEmbedding = await embed(queryText);
  if (!queryEmbedding) {
    // No embedding → fall back to most-important recent.
    const rows = await prisma.memory.findMany({
      where: { userId, decayedAt: null },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: k,
    });
    const decrypted = await Promise.all(rows.map((r) => toRow(r, userId)));
    return decrypted.map((r) => ({ ...r, score: r.importance, similarity: 0 }));
  }

  const vecLiteral = toVectorLiteral(queryEmbedding);
  // Recency decay: messages older than ~90d get a low recency factor (0..1).
  // EXTRACT(EPOCH) gives seconds; 90 days = 7776000.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      user_id: string;
      kind: MemoryKind;
      content: string;
      importance: number;
      confidence: number;
      source: string;
      attrs: Record<string, unknown>;
      created_at: Date;
      last_recalled_at: Date | null;
      decayed_at: Date | null;
      similarity: number;
      score: number;
    }>
  >(
    `SELECT id, user_id, kind, content, importance, confidence, source, attrs,
            created_at, last_recalled_at, decayed_at,
            1 - (embedding <=> $1::vector) AS similarity,
            (0.6 * (1 - (embedding <=> $1::vector)))
            + (0.3 * importance)
            + (0.1 * GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - created_at)) / 7776000.0))) AS score
       FROM memories
      WHERE user_id = $2 AND decayed_at IS NULL AND embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT $3`,
    vecLiteral,
    userId,
    k,
  );

  // Mark these as recalled + write audit-log rows (best-effort, fire-and-forget).
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    prisma.memory
      .updateMany({ where: { id: { in: ids } }, data: { lastRecalledAt: new Date() } })
      .catch((err) => console.error("memory recall-mark failed", err));
    prisma.memoryAccess
      .createMany({
        data: ids.map((memoryId) => ({
          userId,
          memoryId,
          actor: "conversation",
          context: "personal_1on1",
        })),
      })
      .catch((err) => console.error("memory access log failed", err));
  }

  // Decrypt content for each row. We fetch the user's encKey once.
  const encKey = await loadEncKey(userId);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    content: maybeDecrypt(r.content, encKey),
    importance: r.importance,
    confidence: r.confidence,
    source: r.source,
    attrs: r.attrs,
    createdAt: r.created_at,
    lastRecalledAt: r.last_recalled_at,
    decayedAt: r.decayed_at,
    similarity: r.similarity,
    score: r.score,
  }));
}

/**
 * Decay memories: weekly job that reduces importance of long-untouched memories,
 * archives those that fall below the threshold.
 */
export async function decayMemories(): Promise<{ decayed: number; archived: number }> {
  // Reduce importance for memories not recalled in 30+ days.
  const decayed = await prisma.$executeRawUnsafe(
    `UPDATE memories
        SET importance = importance * 0.95
      WHERE decayed_at IS NULL
        AND (last_recalled_at IS NULL OR last_recalled_at < NOW() - INTERVAL '30 days')
        AND created_at < NOW() - INTERVAL '30 days'`,
  );
  const archived = await prisma.$executeRawUnsafe(
    `UPDATE memories
        SET decayed_at = NOW()
      WHERE decayed_at IS NULL AND importance < 0.1`,
  );
  return { decayed: Number(decayed), archived: Number(archived) };
}

/**
 * List memories for a user (paginated, no semantic retrieval).
 * Used by the settings/audit UI and tests.
 */
export async function listMemories(
  userId: string,
  options: { limit?: number; includeDecayed?: boolean } = {},
): Promise<MemoryRow[]> {
  const limit = options.limit ?? 50;
  const where = { userId, decayedAt: options.includeDecayed ? undefined : null };
  const rows = await prisma.memory.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  const encKey = await loadEncKey(userId);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    kind: r.kind as MemoryKind,
    content: maybeDecrypt(r.content, encKey),
    importance: r.importance,
    confidence: r.confidence,
    source: r.source,
    attrs: (r.attrs ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
    lastRecalledAt: r.lastRecalledAt,
    decayedAt: r.decayedAt,
  }));
}

async function toRow(
  r: {
    id: string;
    userId: string;
    kind: string;
    content: string;
    importance: number;
    confidence: number;
    source: string;
    attrs: unknown;
    createdAt: Date;
    lastRecalledAt: Date | null;
    decayedAt: Date | null;
  },
  userIdForDecrypt: string,
): Promise<MemoryRow> {
  const encKey = await loadEncKey(userIdForDecrypt);
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind as MemoryKind,
    content: maybeDecrypt(r.content, encKey),
    importance: r.importance,
    confidence: r.confidence,
    source: r.source,
    attrs: (r.attrs ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
    lastRecalledAt: r.lastRecalledAt,
    decayedAt: r.decayedAt,
  };
}

// ── Encryption helpers ─────────────────────────────────────────────────────

async function loadEncKey(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { encKey: true },
  });
  return u?.encKey ?? null;
}

async function encryptContentForUser(userId: string, plaintext: string): Promise<string> {
  const encKey = await loadEncKey(userId);
  if (!encKey) {
    // User has no key — fall back to plaintext. Run the backfill helper to
    // generate keys for existing users.
    return plaintext;
  }
  return encrypt(plaintext, encKey);
}

function maybeDecrypt(content: string, encKey: string | null): string {
  if (!encKey) return content;
  if (!isCiphertext(content)) return content;
  try {
    return decrypt(content, encKey);
  } catch (err) {
    console.error("memory decrypt failed", err);
    return "[decryption failed]";
  }
}

// Primary-key generator for raw-SQL inserts. crypto.randomUUID() is
// collision-safe and cryptographically random — replaces an earlier Math.random
// implementation that was unsafe at scale. Wrapped in a `c` prefix so the
// shape stays familiar in logs (real cuid2 isn't required here — the column
// is just a unique string).
import { randomUUID as nodeRandomUUID } from "node:crypto";
function cuid(): string {
  return `c${nodeRandomUUID().replace(/-/g, "")}`;
}
