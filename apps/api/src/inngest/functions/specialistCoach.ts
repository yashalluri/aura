// Coach specialist — creates a multi-day accountability sprint.
//
// Given a goal + duration, schedules a series of NudgeSchedule rows at
// intervals appropriate to the goal. Returns a confirmation message.

import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { scheduleNudge } from "../../services/nudges.js";

interface BriefData {
  goal: string;
  context?: string;
  deadline?: string;
  constraints?: string[];
}

export const specialistCoach: InngestFunction.Any = inngest.createFunction(
  {
    id: "specialist-coach",
    triggers: [{ event: "aura/specialist.coach" }],
  },
  async ({ event, step, logger }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, mutedUntil: true },
    });
    if (!user) return { skipped: true };

    // Default to a 14-day sprint with daily morning check-ins + a mid-sprint
    // pulse + a final review.
    const deadline = brief.deadline ? new Date(brief.deadline) : null;
    const startMs = Date.now();
    const endMs = deadline?.getTime() ?? startMs + 14 * 86_400_000;
    const days = Math.max(3, Math.min(30, Math.round((endMs - startMs) / 86_400_000)));

    const scheduled = await step.run("schedule-series", async () => {
      const out: string[] = [];
      // Daily morning check at 9am UTC for the duration.
      for (let i = 1; i <= days; i++) {
        const when = new Date(startMs + i * 86_400_000);
        when.setUTCHours(9, 0, 0, 0);
        const n = await scheduleNudge({
          userId,
          when,
          kind: "callback",
          payload: {
            sprint_goal: brief.goal,
            day: i,
            total: days,
            context: brief.context,
          },
        });
        out.push(n.id);
      }
      return out;
    });

    const bursts = `ok sprint mode on\n\n${days} days for "${brief.goal}"\n\ndaily check at 9am — first one tomorrow\n\nu can text "skip" anytime`;

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "specialist_coach" }),
      });
      if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId, days, scheduled: scheduled.length }, "coach sprint scheduled");
    return { days, nudgesScheduled: scheduled.length };
  },
);
