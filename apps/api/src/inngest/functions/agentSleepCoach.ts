// Sleep coach agent.
//
// Two paths:
//   1. Triggered by aura/signal.event with kind="health.sleep" — light
//      morning callout if it was a rough night, deadpan if it was great.
//   2. Wind-down nudge: cron at 22:30 UTC, fans out per user (later: per
//      user-local-timezone). For users with a connected health integration
//      AND a calendar event before 9am tomorrow, sends "lights out by 11".

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

interface SleepPayload {
  sleep?: { totalHours?: number; bedtime?: string; wake?: string };
  date?: string;
}

export const agentSleepMorning: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-sleep-morning",
    triggers: [{ event: "aura/signal.event" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { userId: string; kind: string; summary: string; occurredAt: string };
    if (data.kind !== "health.sleep") return { skipped: "not sleep" };

    // Pull the latest signal_events row to get the payload (the event data
    // strips it; we re-read for the actual hours).
    const row = await prisma.signalEvent.findFirst({
      where: { userId: data.userId, kind: "health.sleep" },
      orderBy: { occurredAt: "desc" },
    });
    const payload = (row?.payload ?? {}) as SleepPayload;
    const hours = payload.sleep?.totalHours;
    if (typeof hours !== "number") return { skipped: "no hours" };

    // Light morning callout: only on rough nights (<5.5h) or great ones (>=8h).
    if (hours >= 5.5 && hours < 8) return { skipped: "average night" };

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { name: true, mutedUntil: true },
    });
    if (!user || (user.mutedUntil && user.mutedUntil > new Date())) {
      return { skipped: "muted" };
    }

    const tone = hours < 5.5 ? "rough" : "great";

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

They slept ${hours.toFixed(1)} hours last night. That's ${tone === "rough" ? "rough — under 5.5h" : "great — 8h+"}.

Compose a 2-3 burst light morning callout:
- Lowercase. Blank lines between. Each 3-10 words.
- ${tone === "rough" ? "Soft, no pressure. Acknowledge it. Don't lecture." : "Slightly impressed but deadpan. No hype."}
- Optionally suggest one small thing (water, light walk, easy day).
- Friend voice.

Return only the bursts.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.9,
      });
      return completion.choices[0]?.message?.content ?? (tone === "rough"
        ? `${hours.toFixed(1)}h huh\n\nbig water energy today`
        : `${hours.toFixed(1)}h???\n\nok respect`);
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${data.userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: `sleep_morning_${tone}` }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId: data.userId, hours, tone }, "sleep morning sent");
    return { sent: true };
  },
);

export const agentSleepWindDown: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-sleep-wind-down",
    triggers: [{ cron: "30 22 * * *" }], // daily 10:30pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("eligible", () =>
      prisma.user.findMany({
        where: {
          integrations: {
            some: { app: "apple_health", status: "active" },
          },
        },
        select: { id: true, name: true, mutedUntil: true },
      }),
    );

    let sent = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;

      // Find tomorrow's earliest event.
      const tomorrowMorning = new Date();
      tomorrowMorning.setUTCHours(0, 0, 0, 0);
      tomorrowMorning.setUTCDate(tomorrowMorning.getUTCDate() + 1);
      const tomorrowNoon = new Date(tomorrowMorning.getTime() + 12 * 60 * 60 * 1000);
      const earliestTomorrow = await prisma.signalEvent.findFirst({
        where: {
          userId: user.id,
          kind: "calendar.event",
          occurredAt: { gte: tomorrowMorning, lte: tomorrowNoon },
        },
        orderBy: { occurredAt: "asc" },
      });
      if (!earliestTomorrow) continue;

      const earliestTime = earliestTomorrow.occurredAt;
      const hourTomorrow = earliestTime.getUTCHours();
      if (hourTomorrow >= 10) continue; // not actually early

      try {
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: `You are Aura, ${user.name ?? "this person"}'s best friend.

They have an event tomorrow at ${earliestTime.toISOString().slice(11, 16)} UTC. Their typical bedtime needs to support that.

Compose a 2 burst wind-down nudge:
- Lowercase. Blank line between. Each 3-8 words.
- Specific (mention the early event without naming it formally).
- No "Don't forget!" or "Make sure to" — that's AI voice.

Return only the bursts.`,
            },
          ],
          max_tokens: 80,
          temperature: 0.9,
        });
        const bursts = completion.choices[0]?.message?.content ?? `early start tomorrow\n\nlights off by 11?`;

        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${user.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: "sleep_wind_down" }),
        });
        if (res.ok) sent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, "wind-down failed");
      }
    }

    return { sent };
  },
);
