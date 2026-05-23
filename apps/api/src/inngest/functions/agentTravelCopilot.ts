// Travel co-pilot agent.
//
// Two paths:
//   1. **Wish-list watcher** (weekly): scans memories for travel mentions
//      (kind=preference|goal containing "travel", "trip", "visit", country/
//      city names). For each, surfaces 1 reminder per month ("you mentioned
//      Tokyo 3 weeks ago — still on the list?").
//   2. **Departure prep** (daily): for upcoming calendar events that look
//      like flights/travel ("flight to", "trip to", recurring patterns),
//      sends a 24h-out check-in.
//
// Composio integration with flight-price APIs is deferred (needs a paid
// flight-search provider). v1 ships the memory-driven wish-list watcher
// and the calendar-driven departure prep — these work with what we already
// have.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { listMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

const TRAVEL_KEYWORDS = /\b(travel|trip|visit|fly|flight|going to|been wanting to go|wanderlust|vacation|getaway|holiday|backpack|cruise)\b/i;

export const agentTravelWishlist: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-travel-wishlist",
    triggers: [{ cron: "0 14 * * 1" }], // Monday 2pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        select: { id: true, name: true, mutedUntil: true },
      }),
    );

    let sent = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;

      try {
        const memories = await listMemories(user.id, { limit: 200 });
        const travelMentions = memories.filter(
          (m) => (m.kind === "preference" || m.kind === "goal" || m.kind === "value") &&
            TRAVEL_KEYWORDS.test(m.content),
        );
        if (travelMentions.length === 0) continue;

        // Pick the highest-importance not-recently-surfaced one.
        const recent = await prisma.outboundMessage.findFirst({
          where: { userId: user.id, eventType: "travel_wishlist", sentAt: { gt: new Date(Date.now() - 30 * 86_400_000) } },
        });
        if (recent) continue;

        travelMentions.sort((a, b) => b.importance - a.importance);
        const pick = travelMentions[0]!;
        const ageDays = Math.floor((Date.now() - pick.createdAt.getTime()) / 86_400_000);

        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

They mentioned ${ageDays} days ago: "${pick.content}"

Compose a 2-3 burst gentle wish-list nudge:
- Lowercase. Blank lines between. Each 3-12 words.
- Specific — reference what they actually said.
- No "Have you considered". No "Maybe you should".
- Friend voice — "still on the list?" or "did u do anything about that".

Return only the bursts.`,
            },
          ],
          max_completion_tokens: 120,
          temperature: 0.9,
        });
        const bursts = completion.choices[0]?.message?.content;
        if (!bursts) continue;

        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${user.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: "travel_wishlist" }),
        });
        if (res.ok) {
          await prisma.outboundMessage.create({
            data: { userId: user.id, channel: "imessage", eventType: "travel_wishlist", body: bursts },
          });
          sent++;
        }
      } catch (err) {
        logger.error({ err, userId: user.id }, "travel wishlist failed");
      }
    }
    return { sent };
  },
);

const FLIGHT_KEYWORDS = /\b(flight|fly|airport|boarding|gate|terminal|trip to|traveling to)\b/i;

interface CalendarSignal {
  id: string;
  summary: string;
  occurredAt: Date;
}

export const agentTravelDeparturePrep: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-travel-departure-prep",
    triggers: [{ cron: "0 13 * * *" }], // daily 1pm UTC
  },
  async ({ step, logger }) => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setUTCHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setUTCHours(23, 59, 59, 999);

    const candidates = (await step.run("find-departures", () =>
      prisma.signalEvent.findMany({
        where: {
          kind: "calendar.event",
          occurredAt: { gte: tomorrowStart, lte: tomorrowEnd },
        },
      }),
    )) as unknown as CalendarSignal[];

    const flightLike = candidates.filter((c) => FLIGHT_KEYWORDS.test(c.summary));
    if (!flightLike.length) return { sent: 0 };

    let sent = 0;
    for (const event of flightLike) {
      try {
        const ev = await prisma.signalEvent.findUnique({ where: { id: event.id } });
        if (!ev) continue;
        const userId = ev.userId;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, mutedUntil: true },
        });
        if (!user || (user.mutedUntil && user.mutedUntil > new Date())) continue;

        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

They have travel tomorrow: "${event.summary}" at ${event.occurredAt.toISOString().slice(11, 16)} UTC.

Compose a 2-3 burst departure-prep nudge:
- Lowercase. Blank lines between. Each 3-12 words.
- Practical — mention 1-2 things to remember (charger, passport, water bottle, downloading offline music — pick what fits).
- Friend voice — slightly mocking if appropriate ("don't forget ur charger like last time").
- No checklist format.

Return only the bursts.`,
            },
          ],
          max_completion_tokens: 140,
          temperature: 0.85,
        });
        const bursts = completion.choices[0]?.message?.content;
        if (!bursts) continue;

        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: "travel_departure_prep" }),
        });
        if (res.ok) sent++;
      } catch (err) {
        logger.error({ err, eventId: event.id }, "travel departure prep failed");
      }
    }

    return { sent };
  },
);
