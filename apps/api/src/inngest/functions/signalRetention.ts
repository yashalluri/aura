// Signal-event retention purge — implements the Phase 3 "minimize" promise.
//
// Raw integration signals (calendar events, screen-time sessions, health
// samples, mail snippets) are short-lived working data. We process them
// transiently to derive Memory rows (which persist encrypted) and then
// purge the raw payload after a retention window.
//
// Default: 7 days. Tunable via SIGNAL_RETENTION_DAYS env var.

import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

export const signalRetentionPurge: InngestFunction.Any = inngest.createFunction(
  {
    id: "signal-retention-purge",
    triggers: [{ cron: "0 4 * * *" }], // every day at 04:00 UTC
  },
  async ({ step, logger }) => {
    const days = env.SIGNAL_RETENTION_DAYS;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { count } = await step.run("purge-old-signals", () =>
      prisma.signalEvent.deleteMany({
        where: { occurredAt: { lt: cutoff } },
      }),
    );

    logger.info(
      { deleted: count, retentionDays: days, cutoff: cutoff.toISOString() },
      "signal retention purge tick",
    );
    return { deleted: count, retentionDays: days };
  },
);
