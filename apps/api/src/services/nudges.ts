// Nudge scheduling service.
//
// Aura emits `schedule_nudge` actions to defer something to the future. We
// persist the request and a cron picks it up at the right time and delivers
// a friend-voiced text via the conversation worker.

import { prisma } from "../lib/db.js";

export type NudgeKind =
  | "reminder"
  | "goal_check"
  | "contact_nudge"
  | "routine_nudge"
  | "callback";

export interface ScheduleNudgeInput {
  userId: string;
  when: Date;
  kind: NudgeKind;
  payload?: Record<string, unknown>;
}

export async function scheduleNudge(input: ScheduleNudgeInput) {
  return prisma.nudgeSchedule.create({
    data: {
      userId: input.userId,
      when: input.when,
      kind: input.kind,
      payload: (input.payload ?? {}) as object,
    },
  });
}

export async function dueNudges(now = new Date(), limit = 50) {
  return prisma.nudgeSchedule.findMany({
    where: {
      when: { lte: now },
      sentAt: null,
      cancelled: false,
    },
    orderBy: { when: "asc" },
    take: limit,
  });
}

export async function markSent(id: string) {
  return prisma.nudgeSchedule.update({
    where: { id },
    data: { sentAt: new Date() },
  });
}

export async function cancelNudge(id: string) {
  return prisma.nudgeSchedule.update({
    where: { id },
    data: { cancelled: true },
  });
}

export async function listScheduledFor(userId: string, opts: { limit?: number } = {}) {
  return prisma.nudgeSchedule.findMany({
    where: { userId, cancelled: false, sentAt: null },
    orderBy: { when: "asc" },
    take: opts.limit ?? 20,
  });
}
