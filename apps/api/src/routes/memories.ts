// Memory routes — list, retrieve (semantic), write, delete.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { listMemories, retrieveMemories, writeMemory } from "../services/memory.js";

const RetrieveSchema = z.object({
  query: z.string().min(1).max(4000),
  k: z.number().int().min(1).max(50).default(8),
});

const WriteSchema = z.object({
  kind: z.enum(["fact", "preference", "event", "relationship", "goal", "value", "pattern"]),
  content: z.string().min(1).max(2000),
  source: z.string().min(1).max(200),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  attrs: z.record(z.unknown()).optional(),
});

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // List memories (debug + audit)
  app.get<{ Params: { userId: string }; Querystring: { includeDecayed?: string } }>(
    "/users/:userId/memories",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const includeDecayed = req.query.includeDecayed === "true";
      const memories = await listMemories(user.id, { includeDecayed });
      return memories;
    },
  );

  // Semantic retrieval — the hot path for the LLM prompt.
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/memories/retrieve",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const { query, k } = RetrieveSchema.parse(req.body);
      const results = await retrieveMemories(user.id, query, k);
      return results;
    },
  );

  // Manual write (used by integrations, settings, and tests)
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/memories",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const body = WriteSchema.parse(req.body);
      const m = await writeMemory({ userId: user.id, ...body });
      if (!m) return reply.code(500).send({ error: "memory write failed" });
      return reply.code(201).send(m);
    },
  );

  // Delete one (audit / user-correction flow)
  app.delete<{ Params: { userId: string; memoryId: string } }>(
    "/users/:userId/memories/:memoryId",
    async (req) => {
      const m = await prisma.memory.findFirst({
        where: { id: req.params.memoryId, userId: req.params.userId },
      });
      if (!m) throw notFound("Memory");
      await prisma.memory.delete({ where: { id: m.id } });
      return { deleted: true };
    },
  );

  // Purge all (used by /settings/delete)
  app.delete<{ Params: { userId: string } }>(
    "/users/:userId/memories",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const { count } = await prisma.memory.deleteMany({ where: { userId: user.id } });
      return { deleted: count };
    },
  );
}
