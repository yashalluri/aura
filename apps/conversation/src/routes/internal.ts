import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { iMessageChannel } from "../channels/imessage.js";
import { formatDailyCheckin } from "../llm/aura.js";
import { burstDelayMs, splitIntoBursts } from "../lib/burst.js";
import { evaluate, type PolicyDecision } from "../lib/outboundPolicy.js";
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

/**
 * Apply the outbound governor to a candidate send. Fetches user + recent
 * outbound from the API, evaluates the policy, returns the decision.
 * Pure read; never mutates.
 */
async function checkPolicy(
  user: api.ApiUser,
  eventType: string,
  dedupeKey: string | undefined,
): Promise<PolicyDecision> {
  const recent = await api.getRecentOutbound(user.id, 24 * 60);
  return evaluate(
    {
      user: {
        id: user.id,
        timezone: user.timezone,
        mutedUntil: user.mutedUntil ? new Date(user.mutedUntil) : null,
        quietHoursStart: user.quietHoursStart,
        quietHoursEnd: user.quietHoursEnd,
      },
      recentOutbound: recent.map((r) => ({
        eventType: r.eventType,
        sentAt: new Date(r.sentAt),
        replyTo: r.replyTo,
      })),
    },
    eventType,
    dedupeKey,
    new Date(),
  );
}

export const internalRoutes: FastifyPluginAsync = async (app) => {
  // Generic: send a pre-formatted text to a user.
  app.post<{ Params: { userId: string } }>(
    "/internal/send/:userId",
    async (req, reply) => {
      if (!isAuthorized(req)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const { text, eventType, dedupeKey } = SendBodySchema.parse(req.body);
      const user = await api.getUser(req.params.userId);

      const decision = await checkPolicy(user, eventType, dedupeKey);
      if (!decision.allow) {
        req.log.info(
          { userId: user.id, eventType, reason: decision.reason, nextAllowedAt: decision.nextAllowedAt },
          "outbound suppressed by policy",
        );
        return reply.code(200).send({
          ok: true,
          suppressed: true,
          reason: decision.reason,
          nextAllowedAt: decision.nextAllowedAt ?? null,
        });
      }

      const bursts = splitIntoBursts(text);
      const finalBursts = bursts.length ? bursts : [text];
      const sentAt = await sendBursts(user.phoneNumber, finalBursts);

      // Record after the actual send so the next governor check sees it.
      // If this fails, the user GOT the message but the governor's view is
      // stale → next call might bypass cap/cooldown. Log loudly but don't
      // unwind the send.
      try {
        await api.recordOutbound(user.id, {
          channel: "imessage",
          eventType,
          body: finalBursts.join("\n\n"),
        });
      } catch (err) {
        req.log.error(
          { err, userId: user.id, eventType, sentAt },
          "send succeeded but recordOutbound failed — governor view now inconsistent",
        );
      }

      req.log.info(
        { userId: user.id, eventType, sentAt, bursts: finalBursts.length },
        "outbound sent",
      );

      return reply.code(200).send({ ok: true, sentAt, bursts: finalBursts });
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

      const decision = await checkPolicy(user, "daily_checkin", undefined);
      if (!decision.allow) {
        req.log.info(
          { userId: user.id, reason: decision.reason },
          "daily check-in suppressed by policy",
        );
        return reply.code(200).send({
          ok: true,
          suppressed: true,
          reason: decision.reason,
        });
      }

      const { suggestion } = await api.getDailyCheckin(user.id);
      const bursts = await formatDailyCheckin(suggestion, user);
      const sentAt = await sendBursts(user.phoneNumber, bursts);

      try {
        await api.recordOutbound(user.id, {
          channel: "imessage",
          eventType: "daily_checkin",
          body: bursts.join("\n\n"),
        });
      } catch (err) {
        req.log.error(
          { err, userId: user.id, sentAt },
          "check-in sent but recordOutbound failed — governor view now inconsistent",
        );
      }

      req.log.info(
        { userId: user.id, sentAt, bursts: bursts.length },
        "daily check-in sent",
      );

      return reply.code(200).send({ ok: true, sentAt, bursts });
    },
  );
};
