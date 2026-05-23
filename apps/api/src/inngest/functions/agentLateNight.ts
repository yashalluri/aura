// Late-night agent.
//
// Triggered by aura/signal.event with kind="conversation.late_affect" — a
// flag we set in the conversation worker when the user sends an affect-heavy
// message after 23:00 local time. This isn't a separate cron; it's a hook
// that augments the next reply with a softer system-prompt overlay.
//
// IMPLEMENTATION NOTE: Sprint 7 ships only the SIGNAL-EMIT and a stub
// downstream. The actual prompt overlay is applied in
// apps/conversation/src/llm/prompts.ts at the system-prompt assembly point.
// We emit the signal here so retrieval + analytics can see it.

import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";

export const agentLateNight: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-late-night-tag",
    triggers: [{ event: "aura/signal.event" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { userId: string; source: string; kind: string };
    if (data.kind !== "conversation.late_affect") return { skipped: true };

    // Write a soft "in late-night state" memory so downstream agents know to
    // back off for the next 8 hours (no goal nudges, no morning brief
    // alarms, etc.). Implemented as a Memory row with a short-decay flag.
    await step.run("tag-state", async () => {
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await prisma.memory.create({
        data: {
          userId: data.userId,
          kind: "pattern",
          content: "user_in_late_night_state",
          importance: 0.3,
          source: "agent:late_night",
          attrs: { expiresAt: expiresAt.toISOString() } as object,
        },
      });
      logger.info({ userId: data.userId }, "late-night state tagged");
    });

    return { tagged: true };
  },
);
