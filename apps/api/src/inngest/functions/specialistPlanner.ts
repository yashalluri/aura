// Planner specialist.
//
// Triggered by aura/specialist.planner. Builds a multi-step plan grounded
// in:
//   - The user's calendar (free windows)
//   - Knowledge graph (relevant people)
//   - Memory (the user's preferences, prior trips, vibes)
//
// Returns a plan delivered as 3-5 bursts via the conversation worker.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { listMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

interface BriefData {
  goal: string;
  context?: string;
  deadline?: string;
  constraints?: string[];
}

export const specialistPlanner: InngestFunction.Any = inngest.createFunction(
  {
    id: "specialist-planner",
    triggers: [{ event: "aura/specialist.planner" }],
  },
  async ({ event, step, logger }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };

    const ctx = await step.run("gather", async () => {
      const [user, memories, upcomingEvents] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, timezone: true, mutedUntil: true },
        }),
        listMemories(userId, { limit: 50 }),
        prisma.signalEvent.findMany({
          where: {
            userId,
            kind: "calendar.event",
            occurredAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) },
          },
          orderBy: { occurredAt: "asc" },
          take: 40,
        }),
      ]);
      return { user, memories, upcomingEvents };
    });

    if (!ctx.user) {
      logger.warn({ userId }, "planner: user missing");
      return { skipped: true };
    }

    interface MemItem { kind: string; content: string }
    const memoryHints = (ctx.memories as MemItem[])
      .slice(0, 15)
      .map((m) => `- [${m.kind}] ${m.content}`)
      .join("\n") || "(no memories yet)";

    interface CalSig { summary: string; occurredAt: Date }
    const calendarHints = (ctx.upcomingEvents as CalSig[])
      .slice(0, 15)
      .map((e) => `- ${e.occurredAt.toISOString().slice(0, 16)} ${e.summary}`)
      .join("\n") || "(empty calendar)";

    const constraintsLine = brief.constraints?.length
      ? brief.constraints.join("; ")
      : "(none stated)";

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's planner specialist. The user wants:

GOAL: ${brief.goal}
DEADLINE: ${brief.deadline ?? "(no hard deadline)"}
CONSTRAINTS: ${constraintsLine}
CONTEXT THEY SHARED: ${brief.context ?? "(none)"}

What we know about them (memory):
${memoryHints}

Their next 30 days of calendar events:
${calendarHints}

Compose a 3-5 burst plan in friend voice (lowercase, blank lines between, 5-15 words each).
- Concrete steps grounded in the calendar (specific dates/times).
- Reference their preferences from memory ("you usually..., so...").
- ONE thing they need to do FIRST to unblock everything else.
- ONE thing you can do for them next (offer to draft, schedule, etc.).

Return only the bursts.`,
          },
        ],
        max_tokens: 500,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? `ok thought about it\n\nstep 1: pick a date\n\nstep 2: tell me who`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "specialist_planner" }),
      });
      if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId, goal: brief.goal }, "planner delivered");
    return { delivered: true };
  },
);
