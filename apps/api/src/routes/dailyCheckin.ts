import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { userLocalDate } from "../lib/time.js";
import { runDailyCheckinForUser } from "../scheduler/runForUser.js";

export async function dailyCheckinRoutes(app: FastifyInstance): Promise<void> {
  // Computes (and persists) the suggestion for today. Idempotent.
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/daily-checkin",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
      });
      if (!user) throw notFound("User");

      const localDate = userLocalDate(user.timezone);
      const existing = await prisma.dailySuggestionRow.findUnique({
        where: {
          userId_localDate: { userId: user.id, localDate },
        },
      });
      if (existing) {
        return { suggestion: existing.payload, persisted: true, cached: true };
      }
      const result = await runDailyCheckinForUser(user, { persist: true });
      return { ...result, cached: false };
    },
  );

  // Returns only the persisted suggestion for today (does not compute).
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/daily-checkin/today",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
      });
      if (!user) throw notFound("User");
      const localDate = userLocalDate(user.timezone);
      const existing = await prisma.dailySuggestionRow.findUnique({
        where: { userId_localDate: { userId: user.id, localDate } },
      });
      if (!existing) throw notFound("Today's suggestion");
      return existing;
    },
  );
}
