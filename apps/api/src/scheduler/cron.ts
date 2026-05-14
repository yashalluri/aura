import cron from "node-cron";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../lib/db.js";
import { userNow } from "../lib/time.js";
import { runDailyCheckinForUser } from "./runForUser.js";

/**
 * Runs every 15 minutes. For each user whose local hour matches their
 * checkInHour, computes + persists today's suggestion. Idempotent via the
 * unique (userId, localDate) constraint on DailySuggestionRow.
 */
export function startDailyCheckinCron(logger: FastifyBaseLogger): cron.ScheduledTask {
  return cron.schedule("*/15 * * * *", async () => {
    const now = new Date();
    try {
      const users = await prisma.user.findMany();
      let created = 0;
      let skipped = 0;
      for (const user of users) {
        const localHour = userNow(user.timezone, now).hour;
        if (localHour !== user.checkInHour) {
          skipped++;
          continue;
        }
        const { persisted } = await runDailyCheckinForUser(user, {
          persist: true,
          now,
        });
        if (persisted) created++;
      }
      logger.info({ created, skipped, total: users.length }, "daily checkin cron tick");
    } catch (err) {
      logger.error({ err }, "daily checkin cron failed");
    }
  });
}
