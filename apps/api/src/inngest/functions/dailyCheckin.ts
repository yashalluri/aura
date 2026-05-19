import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { userNow } from "../../lib/time.js";
import { runDailyCheckinForUser } from "../../scheduler/runForUser.js";
import { env } from "../../env.js";

/**
 * Scheduler: every 15 min, find users whose local hour matches their
 * checkInHour, and fan out one `aura/checkin.send` event per user.
 */
export const dailyCheckinScheduler: InngestFunction.Any = inngest.createFunction(
  {
    id: "daily-checkin-scheduler",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step, logger }) => {
    const now = new Date();

    const dueUserIds = await step.run("find-due-users", async () => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          timezone: true,
          checkInHour: true,
          mutedUntil: true,
        },
      });
      const due: string[] = [];
      for (const u of users) {
        if (userNow(u.timezone, now).hour !== u.checkInHour) continue;
        if (u.mutedUntil && u.mutedUntil > now) continue;
        due.push(u.id);
      }
      return due;
    });

    if (dueUserIds.length > 0) {
      await step.sendEvent(
        "fan-out",
        dueUserIds.map((userId: string) => ({
          name: "aura/checkin.send",
          data: { userId },
        })),
      );
    }

    logger.info({ dueCount: dueUserIds.length }, "daily checkin scheduler tick");
    return { due: dueUserIds.length };
  },
);

/**
 * Per-user worker: triggered by aura/checkin.send. Computes/persists today's
 * suggestion, then asks the conversation service to format + deliver it.
 */
export const dailyCheckinSender: InngestFunction.Any = inngest.createFunction(
  {
    id: "daily-checkin-sender",
    triggers: [{ event: "aura/checkin.send" }],
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as { userId: string };

    const user = await step.run("load-user", () =>
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    );

    await step.run("compute-and-persist", async () => {
      // Re-fetch with full Date types — step.run-serialized `user` has strings.
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await runDailyCheckinForUser(fresh, { persist: true });
    });

    const result = await step.run("deliver-imessage", async () => {
      const res = await fetch(
        `${env.CONVERSATION_BASE_URL}/internal/send-checkin/${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
        },
      );
      if (!res.ok) {
        throw new Error(
          `conversation /send-checkin returned ${res.status}: ${await res.text()}`,
        );
      }
      return (await res.json()) as { sentAt: string; body: string };
    });

    await step.run("record-outbound", () =>
      prisma.outboundMessage.create({
        data: {
          userId: user.id,
          channel: "imessage",
          eventType: "daily_checkin",
          body: result.body,
          sentAt: new Date(result.sentAt),
        },
      }),
    );

    logger.info({ userId }, "daily checkin delivered");
    return { userId, sentAt: result.sentAt };
  },
);
