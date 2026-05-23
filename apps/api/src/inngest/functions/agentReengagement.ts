// Re-engagement agent.
//
// Daily check: find users who were previously active (>=5 messages in
// history) but went silent for 14+ days. Send a soft "miss u" callback.
// Idempotent per quiet period — we mark a memory once per attempt.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentReengagement: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-reengagement",
    triggers: [{ cron: "0 17 * * *" }], // daily 5pm UTC
  },
  async ({ step, logger }) => {
    const candidates = await step.run("find-candidates", async () => {
      const cutoff = new Date(Date.now() - 14 * 86_400_000);
      // Users with their most-recent message older than 14 days, and at
      // least 5 messages total.
      const rows = await prisma.$queryRaw<Array<{ user_id: string; total: bigint }>>`
        SELECT user_id, COUNT(*) AS total
          FROM messages
         GROUP BY user_id
        HAVING MAX(created_at) < ${cutoff}
           AND COUNT(*) >= 5
        LIMIT 50
      `;
      return rows.map((r) => r.user_id);
    });

    let scheduled = 0;
    for (const userId of candidates) {
      // Don't ping the same user twice in a row — check outbound history.
      const recentReengagement = await prisma.outboundMessage.findFirst({
        where: {
          userId,
          eventType: "reengagement",
          sentAt: { gt: new Date(Date.now() - 21 * 86_400_000) },
        },
      });
      if (recentReengagement) continue;
      await inngest.send({
        name: "aura/agent.reengagement_user",
        data: { userId },
      });
      scheduled++;
    }

    logger.info({ scheduled, scanned: candidates.length }, "reengagement fan-out");
    return { scheduled };
  },
);

export const agentReengagementForUser: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-reengagement-user",
    triggers: [{ event: "aura/agent.reengagement_user" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, mutedUntil: true },
    });
    if (!user || (user.mutedUntil && user.mutedUntil > new Date())) {
      return { skipped: true };
    }

    const lastMessage = await prisma.message.findFirst({
      where: { userId, role: "user" },
      orderBy: { createdAt: "desc" },
    });
    const daysGone = lastMessage
      ? Math.floor((Date.now() - lastMessage.createdAt.getTime()) / 86_400_000)
      : null;

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${user.name ?? "this person"}'s best friend over text.

They've been quiet for ${daysGone ?? "a while"} days. Compose a soft, no-pressure check-in.

Rules:
- 2-3 bursts, blank lines between, 3-10 words each, lowercase.
- Don't be needy. Don't list reasons to come back.
- One specific opener that makes it easy to reply.
- Acceptable: "hey", "checking in", curiosity, gentle roast.
- NEVER: "missed you so much", "I'm worried", "where have you been".

Return only the bursts.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.9,
      });
      return completion.choices[0]?.message?.content ?? `hey\n\nu alive lol\n\nno pressure`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "reengagement" }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      // Track outbound for idempotency.
      await prisma.outboundMessage.create({
        data: {
          userId,
          channel: "imessage",
          eventType: "reengagement",
          body: bursts,
        },
      });
      return res.json();
    });

    return { sent: true };
  },
);
