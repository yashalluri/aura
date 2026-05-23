// Nudge dispatcher.
//
// Runs every 5 minutes. Finds due NudgeSchedule rows, asks the conversation
// worker (via /internal/send) to compose + deliver an LLM-voiced friend
// reminder, marks each as sent.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { dueNudges, markSent } from "../../services/nudges.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const nudgeDispatcher: InngestFunction.Any = inngest.createFunction(
  {
    id: "nudge-dispatcher",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step, logger }) => {
    const due = await step.run("find-due", async () => {
      const rows = await dueNudges(new Date(), 100);
      // Pre-filter: skip users muted right now.
      const userIds = [...new Set(rows.map((r) => r.userId))];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, mutedUntil: true, name: true },
      });
      const muted = new Set(
        users.filter((u) => u.mutedUntil && u.mutedUntil > new Date()).map((u) => u.id),
      );
      return rows.filter((r) => !muted.has(r.userId));
    });

    if (due.length === 0) {
      return { delivered: 0 };
    }

    let delivered = 0;
    for (const n of due) {
      try {
        const bursts = await composeNudge(n.userId, n.kind, n.payload as Record<string, unknown>);
        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${n.userId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: `nudge_${n.kind}` }),
        });
        if (!res.ok) {
          logger.error({ nudge: n.id, status: res.status }, "nudge delivery failed");
          continue;
        }
        await markSent(n.id);
        delivered++;
      } catch (err) {
        logger.error({ err, nudge: n.id }, "nudge dispatch error");
      }
    }

    return { due: due.length, delivered };
  },
);

async function composeNudge(
  userId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, toneMode: true },
  });
  const name = user?.name ?? "this person";
  const description = JSON.stringify(payload);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are Aura, ${name}'s best friend over text. Compose a short reminder.

Reminder kind: ${kind}
Payload: ${description}

Rules:
- 2-3 bursts, blank lines between, 3-10 words each, lowercase.
- Friend voice. No "Reminder:" prefix. No bullets.
- Reference what was scheduled (use the payload).
- If kind is "callback", you're following up on something they said you'd remind them about.

Return only the bursts.`,
      },
    ],
    max_tokens: 150,
    temperature: 0.85,
  });
  return completion.choices[0]?.message?.content ?? `hey\n\nreminder${kind === "callback" ? " (callback)" : ""}: ${description}`;
}
