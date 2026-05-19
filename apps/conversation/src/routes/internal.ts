import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { iMessageChannel } from "../channels/imessage.js";
import { formatDailyCheckin } from "../llm/aura.js";
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

      const result = await iMessageChannel.send(user.phoneNumber, text);

      req.log.info(
        { userId: user.id, eventType, sentAt: result.sentAt },
        "outbound sent",
      );

      return reply.code(200).send({ ok: true, sentAt: result.sentAt });
    },
  );

  // Daily check-in: fetch today's suggestion, format via LLM, send via iMessage.
  app.post<{ Params: { userId: string } }>(
    "/internal/send-checkin/:userId",
    async (req, reply) => {
      if (!isAuthorized(req)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const user = await api.getUser(req.params.userId);
      const { suggestion } = await api.getDailyCheckin(user.id);
      const text = await formatDailyCheckin(suggestion, user);
      const result = await iMessageChannel.send(user.phoneNumber, text);

      req.log.info(
        { userId: user.id, sentAt: result.sentAt },
        "daily check-in sent",
      );

      return reply.code(200).send({ ok: true, sentAt: result.sentAt, body: text });
    },
  );
};
