// Goal review agent.
//
// Weekly: for each user with active goals, picks the most-stale one and
// surfaces a reflective question + status check in friend voice. Doesn't
// dump every goal — just the one most worth touching this week.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { staleGoals } from "../../services/goals.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentGoalReview: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-goal-review",
    triggers: [{ cron: "0 18 * * 5" }], // Friday 6pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        select: { id: true, mutedUntil: true, name: true },
      }),
    );

    let scheduled = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      await inngest.send({
        name: "aura/agent.goal_review_user",
        data: { userId: user.id },
      });
      scheduled++;
    }

    logger.info({ scheduled }, "goal review fan-out");
    return { scheduled };
  },
);

export const agentGoalReviewForUser: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-goal-review-user",
    triggers: [{ event: "aura/agent.goal_review_user" }],
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as { userId: string };

    const target = await step.run("pick-target", async () => {
      const stale = await staleGoals(userId, 14);
      return stale[0] ?? null;
    });

    if (!target) {
      logger.info({ userId }, "no stale goals");
      return { skipped: true };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, toneMode: true },
    });
    const name = user?.name ?? "this person";

    interface MilestoneItem { title: string; doneAt: Date | null }
    const ms = (target.milestones as MilestoneItem[]) ?? [];
    const totalMs = ms.length;
    const doneMs = ms.filter((m) => m.doneAt).length;
    const progress = totalMs > 0 ? `${doneMs}/${totalMs} milestones done` : "no milestones yet";

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${name}'s best friend over text. Compose a short, non-naggy weekly goal check-in.

Goal: "${target.title}"
Kind: ${target.kind}
Why they care: ${target.why ?? "(not stated)"}
Progress: ${progress}
Days since last touched: ${Math.floor((Date.now() - target.updatedAt.getTime()) / 86_400_000)}

Rules:
- 2-3 bursts, blank lines between, 3-12 words each, lowercase.
- Friend voice. Ask ONE specific question that makes them think.
- Not pushy. They can say "skip" and you'd respect it.
- No bullet points. No "let's check in on your goal" framing.

Return only the bursts.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? `hey\n\nstill thinking about ${target.title}?\n\nor not really`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "goal_review" }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    // Touch the goal so we don't re-pick it next week.
    await prisma.goal.update({ where: { id: target.id }, data: { updatedAt: new Date() } });

    return { sent: true, goalId: target.id };
  },
);
