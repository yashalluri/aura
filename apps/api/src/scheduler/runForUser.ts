import type { User } from "@prisma/client";
import type { DailySuggestion } from "@aura/shared";
import { prisma } from "../lib/db.js";
import { userLocalDate } from "../lib/time.js";
import { computeDailySuggestion } from "./compute.js";

const TRAILING_WINDOW_DAYS = 7;

/**
 * Computes the daily suggestion for a user. If `persist` is true, upserts the
 * DailySuggestionRow for today (idempotent via the unique constraint).
 * Returns the suggestion either way.
 */
export async function runDailyCheckinForUser(
  user: User,
  opts: { persist: boolean; now?: Date } = { persist: false },
): Promise<{ suggestion: DailySuggestion; persisted: boolean }> {
  const now = opts.now ?? new Date();
  const trailingFrom = new Date(
    now.getTime() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [contacts, routines, recentDones] = await Promise.all([
    prisma.contact.findMany({ where: { userId: user.id } }),
    prisma.routine.findMany({ where: { userId: user.id } }),
    prisma.eventLog.findMany({
      where: {
        userId: user.id,
        type: "routine_done",
        createdAt: { gte: trailingFrom },
      },
      select: { payload: true, createdAt: true },
    }),
  ]);

  const recentRoutineDones = recentDones
    .map((e) => {
      const payload = e.payload as { routineId?: string } | null;
      return payload?.routineId
        ? { routineId: payload.routineId, createdAt: e.createdAt }
        : null;
    })
    .filter((x): x is { routineId: string; createdAt: Date } => x !== null);

  const suggestion = computeDailySuggestion({
    user: { id: user.id, timezone: user.timezone },
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      targetFrequencyDays: c.targetFrequencyDays,
      lastCheckInAt: c.lastCheckInAt,
      birthday: c.birthday,
      createdAt: c.createdAt,
    })),
    routines: routines.map((r) => ({
      id: r.id,
      name: r.name,
      frequencyType: r.frequencyType,
      frequencyValue: r.frequencyValue,
      lastDoneAt: r.lastDoneAt,
      createdAt: r.createdAt,
    })),
    recentRoutineDones,
    now,
  });

  let persisted = false;
  if (opts.persist) {
    const localDate = userLocalDate(user.timezone, now);
    try {
      await prisma.dailySuggestionRow.create({
        data: {
          userId: user.id,
          localDate,
          payload: suggestion as unknown as object,
        },
      });
      await prisma.eventLog.create({
        data: {
          userId: user.id,
          type: "suggestion_created",
          payload: { localDate },
        },
      });
      persisted = true;
    } catch (err) {
      // Unique-constraint violation = already created today; treat as success.
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
    }
  }

  return { suggestion, persisted };
}
