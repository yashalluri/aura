import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { iMessageChannel } from "../channels/imessage.js";
import { formatDailyCheckin } from "../llm/aura.js";
import { burstDelayMs, splitIntoBursts } from "../lib/burst.js";
import * as api from "../lib/apiClient.js";
import { env } from "../env.js";

const SendBodySchema = z.object({
  text: z.string().min(1).max(2000),
  eventType: z.string().min(1),
  dedupeKey: z.string().optional(),
});

function isAuthorized(req: FastifyRequest): boolean {
  const auth = req.headers.authorization;
  if (typeof auth !== "string") return false;
  return auth === `Bearer ${env.INTERNAL_API_SECRET}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBursts(toPhone: string, bursts: string[]): Promise<Date> {
  let lastSentAt = new Date();
  for (let i = 0; i < bursts.length; i++) {
    const chunk = bursts[i];
    if (!chunk) continue;
    if (i > 0) await sleep(burstDelayMs());
    const result = await iMessageChannel.send(toPhone, chunk);
    lastSentAt = result.sentAt;
  }
  return lastSentAt;
}

export const internalRoutes: FastifyPluginAsync = async (app) => {
  // Generic: send a pre-formatted text to a user.
  app.post<{ Params: { userId: string } }>(
    "/internal/send/:userId",
    async (req, reply) => {
      if (!isAuthorized(req)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const { text, eventType } = SendBodySchema.parse(req.body);
      const user = await api.getUser(req.params.userId);

      // Treat the inbound text as potentially-multi-burst (blank lines between).
      // splitIntoBursts handles both single-burst and multi-burst input.
      const bursts = splitIntoBursts(text);
      const sentAt = await sendBursts(user.phoneNumber, bursts.length ? bursts : [text]);

      req.log.info(
        { userId: user.id, eventType, sentAt, bursts: bursts.length },
        "outbound sent",
      );

      return reply.code(200).send({ ok: true, sentAt, bursts });
    },
  );

  // Daily check-in: fetch today's suggestion, format via LLM, send via iMessage as bursts.
  app.post<{ Params: { userId: string } }>(
    "/internal/send-checkin/:userId",
    async (req, reply) => {
      if (!isAuthorized(req)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const user = await api.getUser(req.params.userId);
      const { suggestion } = await api.getDailyCheckin(user.id);
      const bursts = await formatDailyCheckin(suggestion, user);
      const sentAt = await sendBursts(user.phoneNumber, bursts);

      req.log.info(
        { userId: user.id, sentAt, bursts: bursts.length },
        "daily check-in sent",
      );

      return reply.code(200).send({ ok: true, sentAt, bursts });
    },
  );
};
