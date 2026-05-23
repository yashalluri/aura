// Soft-commitments register.
//
// Triggered after memory-extract jobs that produce a memory with content
// matching "I should...", "I keep saying I'll...", "I want to..." patterns
// — these get tagged as soft commitments. Then a weekly cron surfaces
// the most-repeated soft commitment as a "you keep saying this" callback.
//
// Implementation strategy: rather than a separate signal, we use the
// existing Memory table (kind=pattern, source="commitment_register"). The
// memoryExtract job already produces pattern memories — we just need a
// reader that finds them.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { listMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentSoftCommitments: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-soft-commitments",
    triggers: [{ cron: "0 16 * * 3" }], // Wednesday 4pm UTC
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
        const memories = await listMemories(user.id, { limit: 100 });
        // Find soft-commitment candidates: pattern-kind memories whose
        // content suggests aspiration/promise. Cheap regex scan.
        const candidates = memories.filter((m) => {
          if (m.kind !== "pattern" && m.kind !== "goal" && m.kind !== "value") return false;
          const c = m.content.toLowerCase();
          return /\b(should|keep saying|been meaning|want to|going to|gotta|need to|trying to)\b/.test(c);
        });
        if (candidates.length < 2) continue;

        // Pick the highest-importance one.
        candidates.sort((a, b) => b.importance - a.importance);
        const top = candidates[0]!;

        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

You noticed they keep talking about this without doing it:
"${top.content}"

Compose a 2-3 burst soft callback:
- Lowercase. Blank lines between. Each 3-10 words.
- NOT a lecture. NOT motivational. Just a gentle "u keep saying this lol".
- Optionally one tiny step they could take TODAY.
- Friend voice. They should be able to say "yeah ik" and have you respect that.

Return only the bursts.`,
            },
          ],
          max_tokens: 120,
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
          body: JSON.stringify({ text: bursts, eventType: "soft_commitment" }),
        });
        if (res.ok) sent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, "soft commitment failed");
      }
    }

    return { sent };
  },
);
