// Relationship pulse agent.
//
// Weekly: scans graph for `person` entities whose Contact is overdue
// (lastCheckInAt > targetFrequencyDays ago). Picks the top 3, drafts a
// "wanna text X?" nudge with a pre-drafted message ready to copy.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { pulse } from "../../services/graph.js";
import { retrieveMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentRelationshipPulse: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-relationship-pulse",
    triggers: [{ cron: "0 19 * * 0" }], // Sunday 7pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        select: { id: true, timezone: true, mutedUntil: true, name: true },
      }),
    );

    let scheduled = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      await inngest.send({
        name: "aura/agent.relationship_pulse_user",
        data: { userId: user.id },
      });
      scheduled++;
    }

    logger.info({ scheduled }, "relationship pulse fan-out");
    return { scheduled };
  },
);

export const agentRelationshipPulseForUser: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-relationship-pulse-user",
    triggers: [{ event: "aura/agent.relationship_pulse_user" }],
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as { userId: string };

    const candidates = await step.run("find-candidates", async () => {
      const all = await pulse(userId);
      // Eligible = person entities with daysSince > 14
      return all.filter((c) => c.daysSince !== null && c.daysSince > 14).slice(0, 3);
    });

    if (!candidates.length) {
      logger.info({ userId }, "no overdue relationships");
      return { skipped: true };
    }

    const top = candidates[0]!;
    const name = top.entity.canonical;
    const days = top.daysSince ?? 0;

    // Use a memory query to find what we know about this person.
    const memories = await step.run("recall", () =>
      retrieveMemories(userId, `relationship with ${name}`, 5),
    );
    interface MemoryItem { content: string }
    const memoryBlock = (memories as MemoryItem[]).map((m) => `- ${m.content}`).join("\n") || "(no specifics yet)";

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${name}'s friend's best friend, texting your friend (the user).
Compose a 2-3 burst message, blank lines between, 3-12 words each, lowercase,
that gently calls out it's been ${days} days since they last texted ${name}.
End with one specific suggested opener (the user can copy/send).

What we remember about ${name}:
${memoryBlock}

Return only the bursts, blank lines between, no preamble.`,
          },
        ],
        max_completion_tokens: 220,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? `u haven't texted ${name} in ${days} days\n\njust send "hi"`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "relationship_pulse" }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    return { sent: true, target: name };
  },
);
