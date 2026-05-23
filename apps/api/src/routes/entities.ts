// Knowledge graph routes — entities + relations.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import {
  listEntities,
  resolve,
  upsertEntity,
  pulse,
  mirrorContactsToEntities,
} from "../services/graph.js";

const ENTITY_KINDS = ["person", "place", "project", "topic", "habit", "media", "org"] as const;

const UpsertSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  canonical: z.string().min(1).max(200),
  aliases: z.array(z.string()).optional(),
  attrs: z.record(z.unknown()).optional(),
  contactId: z.string().optional(),
});

const RelationSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.string().min(1).max(60),
  strength: z.number().min(0).max(1).optional(),
});

export async function entityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { userId: string }; Querystring: { kind?: string } }>(
    "/users/:userId/entities",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const kind = req.query.kind as typeof ENTITY_KINDS[number] | undefined;
      return listEntities(user.id, kind);
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/entities",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const body = UpsertSchema.parse(req.body);
      const entity = await upsertEntity({ userId: user.id, ...body });
      return reply.code(201).send(entity);
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/entities/resolve",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const { name, kind } = z
        .object({
          name: z.string().min(1).max(200),
          kind: z.enum(ENTITY_KINDS).optional(),
        })
        .parse(req.body);
      const entity = await resolve(user.id, name, kind);
      return entity ?? null;
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/entities/mirror-contacts",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const count = await mirrorContactsToEntities(user.id);
      return { mirrored: count };
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/users/:userId/entities/pulse",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      return pulse(user.id);
    },
  );

  // ── Relations ────────────────────────────────────────────────
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/relations",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const body = RelationSchema.parse(req.body);
      const relation = await prisma.relation.create({
        data: {
          userId: user.id,
          fromId: body.fromId,
          toId: body.toId,
          kind: body.kind,
          strength: body.strength ?? 0.5,
        },
      });
      return reply.code(201).send(relation);
    },
  );
}
