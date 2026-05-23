// Persistent conversation history routes.
//
// Replaces the 4-hour in-process Map in the conversation worker with
// Postgres-backed storage. Every inbound + outbound message gets recorded.
//
// Phase 3: Message.content is encrypted at rest with the per-user encKey.
// Reads are back-compat with plaintext rows from before the migration —
// isCiphertext() distinguishes the v1 envelope format.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { inngest } from "../inngest/client.js";
import { encrypt, decrypt, isCiphertext } from "../lib/crypto.js";

const CreateMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
  channel: z.string().optional(),
});

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.date().optional(),
});

function maybeDecryptContent(content: string, encKey: string | null): string {
  if (!encKey) return content;
  if (!isCiphertext(content)) return content; // back-compat with pre-Phase-3 plaintext rows
  try {
    return decrypt(content, encKey);
  } catch {
    return "[decryption failed]";
  }
}

function maybeEncryptContent(plaintext: string, encKey: string | null): string {
  if (!encKey) return plaintext; // user has no key (pre-backfill); fall back to plaintext
  return encrypt(plaintext, encKey);
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // List recent messages (newest last so the LLM gets natural chronological order)
  app.get<{ Params: { userId: string }; Querystring: { limit?: string; before?: string } }>(
    "/users/:userId/messages",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, encKey: true },
      });
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
      return rows.reverse().map((r) => ({
        ...r,
        content: maybeDecryptContent(r.content, user.encKey),
      }));
    },
  );

  // Append a message and trigger memory extraction.
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/messages",
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, encKey: true },
      });
      if (!user) throw notFound("User");

      const body = CreateMessageSchema.parse(req.body);
      const message = await prisma.message.create({
        data: {
          userId: user.id,
          role: body.role,
          content: maybeEncryptContent(body.content, user.encKey),
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

      // Return decrypted to caller so the conversation worker can use the
      // content directly without round-tripping the key.
      return reply.code(201).send({
        ...message,
        content: body.content,
      });
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

  // Memory-access transparency log (Phase 3): list memory_accesses rows
  // for the user so the /you graph can show "Aura recalled X memories
  // today" + which agent/context triggered each.
  app.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    "/users/:userId/memory-accesses",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true },
      });
      if (!user) throw notFound("User");
      const limit = Math.min(
        parseInt((req.query.limit ?? "100") as string, 10) || 100,
        500,
      );
      return prisma.memoryAccess.findMany({
        where: { userId: user.id },
        orderBy: { accessedAt: "desc" },
        take: limit,
      });
    },
  );

  // Memory extraction may also need to read the message we just stored;
  // it goes through prisma directly so we expose a single-message GET.
  app.get<{ Params: { userId: string; messageId: string } }>(
    "/users/:userId/messages/:messageId",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, encKey: true },
      });
      if (!user) throw notFound("User");
      const message = await prisma.message.findFirst({
        where: { id: req.params.messageId, userId: user.id },
      });
      if (!message) throw notFound("Message");
      return {
        ...message,
        content: maybeDecryptContent(message.content, user.encKey),
      };
    },
  );
}
