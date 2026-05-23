// User settings / data-rights routes.
//
//   GET    /internal/users/:id/export   — JSON dump of everything we know
//   DELETE /internal/users/:id           — hard delete (Cascade clears all data)
//   GET    /internal/users/:id/memory-accesses — audit trail of memory reads
//
// The export decrypts content using the user's key so the user gets readable
// data. Delete is irreversible and Cascade-clears every owned row.

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { decrypt, isCiphertext } from "../lib/crypto.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Export everything. Plaintext (decrypted) JSON — suitable for a user
  // download. In Sprint 4+ we'll add a passphrase-protected encrypted bundle.
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/export",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
      });
      if (!user) throw notFound("User");

      const [contacts, routines, messages, memories, entities, relations, integrations, signals, accesses] =
        await Promise.all([
          prisma.contact.findMany({ where: { userId: user.id } }),
          prisma.routine.findMany({ where: { userId: user.id } }),
          prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
          prisma.memory.findMany({ where: { userId: user.id } }),
          prisma.entity.findMany({ where: { userId: user.id } }),
          prisma.relation.findMany({ where: { userId: user.id } }),
          prisma.integrationConnection.findMany({ where: { userId: user.id } }),
          prisma.signalEvent.findMany({
            where: { userId: user.id },
            orderBy: { occurredAt: "desc" },
            take: 1000,
          }),
          prisma.memoryAccess.findMany({
            where: { userId: user.id },
            orderBy: { accessedAt: "desc" },
            take: 1000,
          }),
        ]);

      const encKey = user.encKey;
      const decryptedMemories = memories.map((m) => ({
        ...m,
        content: encKey && isCiphertext(m.content) ? safeDecrypt(m.content, encKey) : m.content,
      }));

      // Strip encKey itself from the export — that's a secret, not user data.
      const { encKey: _ignored, ...userPublic } = user;

      return {
        user: userPublic,
        contacts,
        routines,
        messages,
        memories: decryptedMemories,
        entities,
        relations,
        integrations: integrations.map(({ webhookToken: _t, composioConnectionId: _c, ...rest }) => rest),
        signals,
        accesses,
        exportedAt: new Date().toISOString(),
      };
    },
  );

  // Hard delete — Cascade removes every owned row. Irreversible.
  app.delete<{ Params: { userId: string } }>(
    "/users/:userId",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      await prisma.user.delete({ where: { id: user.id } });
      return reply.code(200).send({ deleted: true });
    },
  );

  // Memory access audit trail.
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/memory-accesses",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      return prisma.memoryAccess.findMany({
        where: { userId: user.id },
        orderBy: { accessedAt: "desc" },
        take: 200,
      });
    },
  );
}

function safeDecrypt(ciphertext: string, encKey: string): string {
  try {
    return decrypt(ciphertext, encKey);
  } catch {
    return "[decryption failed]";
  }
}
