// Persistent conversation history routes.
//
// Replaces the 4-hour in-process Map in the conversation worker with
// Postgres-backed storage. Every inbound + outbound message gets recorded.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { inngest } from "../inngest/client.js";

const CreateMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
  channel: z.string().optional(),
});

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.date().optional(),
});

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // List recent messages (newest last so the LLM gets natural chronological order)
  app.get<{ Params: { userId: string }; Querystring: { limit?: string; before?: string } }>(
    "/users/:userId/messages",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      const { limit, before } = QuerySchema.parse(req.query);
      const rows = await prisma.message.findMany({
        where: {
          userId: user.id,
          ...(before ? { createdAt: { lt: before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      // Return oldest-first so callers can drop straight into a chat array.
      return rows.reverse();
    },
  );

  // Append a message and trigger memory extraction.
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/messages",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      const body = CreateMessageSchema.parse(req.body);
      const message = await prisma.message.create({
        data: {
          userId: user.id,
          role: body.role,
          content: body.content,
          channel: body.channel ?? null,
        },
      });

      // Fire memory extraction for user turns. Don't await — the reply
      // should not block on this.
      if (body.role === "user") {
        inngest
          .send({
            name: "aura/memory.extract",
            data: { userId: user.id, messageId: message.id },
          })
          .catch((err) => req.log.error({ err }, "memory.extract enqueue failed"));
      }

      return reply.code(201).send(message);
    },
  );

  // Purge: delete all messages for a user (used by the /settings/delete flow).
  app.delete<{ Params: { userId: string } }>(
    "/users/:userId/messages",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const { count } = await prisma.message.deleteMany({ where: { userId: user.id } });
      return { deleted: count };
    },
  );
}
