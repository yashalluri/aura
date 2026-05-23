// Call surface agent.
//
// Triggered by aura/signal.event with kind="phone.missed". After a 30-min
// cooldown (don't ping mid-call-back), prompts the user with a "u missed
// mom" and offers a draft_text_to_contact follow-up.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentCallSurface: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-call-surface",
    triggers: [{ event: "aura/signal.event" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as {
      userId: string;
      kind: string;
      summary: string;
      occurredAt: string;
    };
    if (data.kind !== "phone.missed") return { skipped: "not a missed call" };

    // Cooldown: skip if the user called the same number back within 30 min.
    // We don't have direction-matched call records yet — for v1 we just wait
    // 30 min after the missed-call event before notifying.
    const eventTime = new Date(data.occurredAt);
    const age = (Date.now() - eventTime.getTime()) / 60000; // minutes
    if (age < 30) {
      // Re-queue for later.
      await step.sleep("cooldown", "30m");
    }

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { name: true, mutedUntil: true },
    });
    if (!user || (user.mutedUntil && user.mutedUntil > new Date())) {
      return { skipped: "muted" };
    }

    // Parse who from "Missed call from Mom".
    const fromMatch = data.summary.match(/from\s+(.+)$/i);
    const caller = fromMatch?.[1]?.trim() ?? "someone";

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

They missed a call from ${caller} ${Math.round(age)} minutes ago.

Compose a 2-3 burst nudge:
- Lowercase. Blank lines between. Each 3-10 words.
- Friend voice. Slightly mocking if they often miss calls; warm if it's family.
- End with offering to help: "want me to draft a 'sorry missed u' text?"

Return only the bursts.`,
          },
        ],
        max_completion_tokens: 120,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? `${caller} called\n\nu missed it\n\nwant me to draft a quick text?`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${data.userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "call_surface" }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId: data.userId, caller }, "call surface sent");
    return { sent: true, caller };
  },
);
