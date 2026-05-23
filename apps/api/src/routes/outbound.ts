// Outbound-message tracking endpoints. List + record. Used by the conversation
// service's outboundPolicy governor (apps/conversation/src/lib/outboundPolicy.ts)
// to enforce quiet hours, daily caps, cooldown, and dedupe.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const RecordSchema = z.object({
  channel: z.string().min(1),
  eventType: z.string().min(1),
  body: z.string().min(1).max(8000),
  providerSid: z.string().optional(),
  replyTo: z.string().optional(),
});

export async function outboundRoutes(app: FastifyInstance): Promise<void> {
  // List recent outbound for a user. Default window: last 24h.
  app.get<{ Params: { userId: string }; Querystring: { sinceMinutes?: string } }>(
    "/users/:userId/outbound",
    async (req) => {
      const minutes = Math.max(
        1,
        Math.min(
          parseInt(req.query.sinceMinutes ?? "1440", 10) || 1440,
          7 * 24 * 60, // cap at one week
        ),
      );
      const since = new Date(Date.now() - minutes * 60_000);

      const rows = await prisma.outboundMessage.findMany({
        where: { userId: req.params.userId, sentAt: { gte: since } },
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          channel: true,
          eventType: true,
          sentAt: true,
          providerSid: true,
          replyTo: true,
        },
      });
      return rows;
    },
  );

  // Record an outbound message (called by the conversation service after a
  // governor-allowed send completes).
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/outbound",
    async (req, reply) => {
      const body = RecordSchema.parse(req.body);
      const userExists = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true },
      });
      if (!userExists) throw notFound("User");

      const row = await prisma.outboundMessage.create({
        data: {
          userId: req.params.userId,
          channel: body.channel,
          eventType: body.eventType,
          body: body.body,
          providerSid: body.providerSid ?? null,
          replyTo: body.replyTo ?? null,
        },
      });
      return reply.code(201).send(row);
    },
  );
}
