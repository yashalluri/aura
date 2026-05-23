// Yearly review agent.
//
// Runs Dec 28 at 7pm UTC. Generates a real, not-generic year-end thread
// from a year of memories + signal aggregates per user. Sent as 4-6 bursts.
//
// Sources:
//   - Memory rows from the last 12 months (preferences/events/relationships/goals/values)
//   - SignalEvent aggregates (count by source, top categories, big moments)
//   - Goals achieved + still-active
//   - Relationship pulse (top 5 by lastEventAt strength)

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentYearlyReview: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-yearly-review",
    triggers: [{ cron: "0 19 28 12 *" }], // Dec 28, 7pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        select: { id: true, name: true, mutedUntil: true, createdAt: true },
      }),
    );

    const yearStart = new Date(new Date().getUTCFullYear(), 0, 1);
    let sent = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      // Skip brand-new users (joined this year, less than 30 days).
      if (Date.now() - user.createdAt.getTime() < 30 * 86_400_000) continue;
      try {
        await sendYearlyReview(user.id, user.name ?? "this person", yearStart);
        sent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, "yearly review failed");
      }
    }
    return { sent };
  },
);

async function sendYearlyReview(userId: string, name: string, yearStart: Date) {
  const [memories, signals, completedGoals, activeGoals] = await Promise.all([
    prisma.memory.findMany({
      where: { userId, createdAt: { gte: yearStart }, decayedAt: null },
      orderBy: { importance: "desc" },
      take: 30,
    }),
    prisma.signalEvent.findMany({
      where: { userId, occurredAt: { gte: yearStart } },
      select: { source: true, kind: true },
    }),
    prisma.goal.findMany({
      where: { userId, status: "done", updatedAt: { gte: yearStart } },
    }),
    prisma.goal.findMany({
      where: { userId, status: "active" },
    }),
  ]);

  // Tally signal source counts.
  const sourceCounts = new Map<string, number>();
  for (const s of signals) {
    sourceCounts.set(s.source, (sourceCounts.get(s.source) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, n]) => `${s}=${n}`)
    .join(", ");

  // Memory hints: pull a mix of kinds, decrypt happens in service layer
  // already (memories.findMany returns ciphertext here — we need a decrypt
  // pass for the LLM. Use listMemories from the service which decrypts).
  const { listMemories } = await import("../../services/memory.js");
  const decryptedMemories = await listMemories(userId, { limit: 30 });
  const memHints = decryptedMemories
    .slice(0, 20)
    .map((m) => `- [${m.kind}] ${m.content}`)
    .join("\n") || "(thin year)";

  const goalsCompletedLine = completedGoals.length
    ? completedGoals.map((g) => `"${g.title}"`).join(", ")
    : "(none marked done)";
  const goalsActiveLine = activeGoals.length
    ? activeGoals.map((g) => `"${g.title}"`).join(", ")
    : "(none active)";

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are Aura, ${name}'s best friend over text. It's late December. Compose ${name}'s year-end reflection.

What you know from the past year:

Memories (top 20 by importance):
${memHints}

Goals completed: ${goalsCompletedLine}
Goals still active: ${goalsActiveLine}
Signal volumes: ${topSources}

Compose a 5-6 burst year-end thread:
- Lowercase. Blank lines between. Each burst 5-15 words.
- Personal. Reference specific things from the memories above — not generic.
- ONE observation that's earned (something you noticed across the year).
- ONE question to think about going into next year.
- Friend voice. No "New year, new you". No motivational closer. No emoji parade.

Return only the bursts.`,
      },
    ],
    max_tokens: 500,
    temperature: 0.9,
  });

  const bursts = completion.choices[0]?.message?.content;
  if (!bursts) return;

  await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
    },
    body: JSON.stringify({ text: bursts, eventType: "yearly_review" }),
  });
}
