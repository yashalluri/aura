// Morning brief agent.
//
// Replaces the static daily-suggestion content with a friend-voiced summary:
// top 3 priorities (from goals / signals / routines), 1 relationship-pulse
// callout, 1 routine reminder. Generates 2-4 bursts that the conversation
// worker sends as separate iMessages.
//
// Triggered by the existing aura/checkin.send event (already cron-driven
// from dailyCheckinScheduler). We hook in as a *second* function on the
// same event so the old behavior can be flagged on/off as we cut over.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { recentSignals } from "../../services/signals.js";
import { listMemories } from "../../services/memory.js";
import { pulse } from "../../services/graph.js";
import { runDailyCheckinForUser } from "../../scheduler/runForUser.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentMorningBrief: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-morning-brief",
    triggers: [{ event: "aura/agent.morning_brief" }],
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as { userId: string };

    const ctx = await step.run("gather-context", async () => {
      const [user, suggestion, memories, peoplePulse, signals] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.dailySuggestionRow.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        listMemories(userId, { limit: 10 }),
        pulse(userId),
        recentSignals(userId, {
          since: new Date(Date.now() - 24 * 60 * 60 * 1000),
          limit: 20,
        }),
      ]);
      if (!user) return null;
      // Make sure we have a fresh suggestion (compute if missing for today).
      if (!suggestion) {
        await runDailyCheckinForUser(user, { persist: true });
      }
      return { user, memories, peoplePulse, signals };
    });

    if (!ctx) {
      logger.warn({ userId }, "morning brief: user not found");
      return { sent: false };
    }

    // Build a compact context block for the LLM.
    interface MemoryItem { kind: string; content: string }
    const memoryHints = (ctx.memories as MemoryItem[])
      .slice(0, 5)
      .map((m) => `- [${m.kind}] ${m.content}`)
      .join("\n") || "(no memories yet)";

    interface PulseItem { entity: { canonical: string }; daysSince: number | null }
    interface SignalItem { source: string; summary: string }
    const pulsePeople = (ctx.peoplePulse as PulseItem[])
      .filter((p) => p.daysSince !== null && p.daysSince > 0)
      .slice(0, 3)
      .map((p) => `${p.entity.canonical} (${p.daysSince}d since last)`)
      .join(", ") || "(no overdue relationships)";

    const signalSummary = (ctx.signals as SignalItem[])
      .slice(0, 5)
      .map((s) => `${s.source}: ${s.summary}`)
      .join("\n") || "(no recent signals)";

    const bursts = await step.run("compose", async () => {
      const prompt = `Generate a morning brief as Aura, ${ctx.user.name ?? "this person"}'s best friend over text.

Rules:
- 2-4 short bursts, separated by blank lines, 3-12 words each.
- Lowercase by default. No emoji unless it really fits.
- Mention ONE specific thing that matters today. Not a to-do list.
- Optionally call back to something they're working on.
- No "good morning!" opener. Vary it.

Context:
Memories:
${memoryHints}

Relationship pulse: ${pulsePeople}

Recent signals (last 24h):
${signalSummary}

Return the message bursts only, no preamble. Use blank lines between bursts.`;

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 250,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? "morning";
    });

    // Send via the conversation worker (it'll split + burst-send).
    await step.run("deliver", async () => {
      const res = await fetch(
        `${env.CONVERSATION_BASE_URL}/internal/send/${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({
            text: bursts,
            eventType: "morning_brief",
          }),
        },
      );
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    return { sent: true };
  },
);
