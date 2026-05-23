// On-this-day agent.
//
// Daily 11am UTC. For each user, looks for *meaningful* anniversaries —
// not "here's a random photo from 5 years ago" but "this is the day you
// first texted Maya" or "1 year ago you had that interview you were
// freaking out about — look at you now".
//
// Sources of meaningful dates:
//   - First message between user and a high-importance entity (from memories)
//   - Big calendar events from 1 year ago today (calendar.event signals)
//   - Goals completed exactly N years ago (Goal updatedAt)
//
// Cooldown: only one "on this day" per user per day.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentOnThisDay: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-on-this-day",
    triggers: [{ cron: "0 11 * * *" }], // daily 11am UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        select: { id: true, name: true, mutedUntil: true, createdAt: true },
      }),
    );

    let sent = 0;
    const today = new Date();
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      // Skip users who joined less than 90 days ago — not enough history yet.
      if (Date.now() - user.createdAt.getTime() < 90 * 86_400_000) continue;

      // Cooldown — already sent today?
      const todayStart = new Date(today);
      todayStart.setUTCHours(0, 0, 0, 0);
      const existing = await prisma.outboundMessage.findFirst({
        where: { userId: user.id, eventType: "on_this_day", sentAt: { gte: todayStart } },
      });
      if (existing) continue;

      try {
        const sentForUser = await processUser(user.id, user.name ?? "this person", today);
        if (sentForUser) sent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, "on this day failed");
      }
    }
    return { sent };
  },
);

async function processUser(userId: string, name: string, today: Date): Promise<boolean> {
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  // Find calendar events from prior years on this calendar day.
  const calendarMatches = await prisma.signalEvent.findMany({
    where: { userId, kind: "calendar.event" },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });
  const sameDayEvents = calendarMatches.filter((e) => {
    const d = new Date(e.occurredAt);
    return (
      d.getUTCMonth() === month &&
      d.getUTCDate() === day &&
      d.getUTCFullYear() < today.getUTCFullYear()
    );
  });

  // Find goals completed on this calendar day in prior years.
  const completedGoals = await prisma.goal.findMany({
    where: { userId, status: "done" },
  });
  const sameDayGoals = completedGoals.filter((g) => {
    const d = new Date(g.updatedAt);
    return (
      d.getUTCMonth() === month &&
      d.getUTCDate() === day &&
      d.getUTCFullYear() < today.getUTCFullYear()
    );
  });

  if (!sameDayEvents.length && !sameDayGoals.length) return false;

  const eventLines = sameDayEvents
    .slice(0, 2)
    .map((e) => `- ${e.occurredAt.getUTCFullYear()}: ${e.summary}`)
    .join("\n");
  const goalLines = sameDayGoals
    .slice(0, 2)
    .map((g) => `- ${g.updatedAt.getUTCFullYear()}: completed "${g.title}"`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are Aura, ${name}'s best friend over text. Today's date in past years had these moments:

${eventLines || "(no past events on this day)"}
${goalLines || ""}

Compose a 2-3 burst "on this day" callback:
- Lowercase. Blank lines between. Each 3-12 words.
- Specific — name the actual past event/goal.
- Warm but not sappy. No "Time flies!".
- If it's a goal they crushed, observe how far they've come.
- Friend voice. No "happy anniversary".

Return only the bursts.`,
      },
    ],
    max_tokens: 180,
    temperature: 0.9,
  });
  const bursts = completion.choices[0]?.message?.content;
  if (!bursts) return false;

  const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
    },
    body: JSON.stringify({ text: bursts, eventType: "on_this_day" }),
  });
  if (!res.ok) return false;

  await prisma.outboundMessage.create({
    data: {
      userId,
      channel: "imessage",
      eventType: "on_this_day",
      body: bursts,
    },
  });
  return true;
}
