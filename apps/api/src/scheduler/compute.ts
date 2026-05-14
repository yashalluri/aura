import type {
  ContactNudge,
  DailySuggestion,
  RoutineNudge,
} from "@aura/shared";
import { daysBetween, daysUntilAnnual, userLocalDate } from "../lib/time.js";

export interface ComputeUser {
  id: string;
  timezone: string;
}

export interface ComputeContact {
  id: string;
  name: string;
  targetFrequencyDays: number;
  lastCheckInAt: Date | null;
  birthday: Date | null;
  createdAt: Date;
}

export interface ComputeRoutine {
  id: string;
  name: string;
  frequencyType: "daily" | "weekly" | "custom";
  frequencyValue: number;
  lastDoneAt: Date | null;
  createdAt: Date;
}

export interface ComputeInput {
  user: ComputeUser;
  contacts: ComputeContact[];
  routines: ComputeRoutine[];
  /** Recent EventLog rows of type "routine_done" used for trailing-7-day weekly checks. */
  recentRoutineDones: Array<{ routineId: string; createdAt: Date }>;
  now: Date;
}

const MAX_CONTACTS = 5;
const MAX_ROUTINES = 4;
const BIRTHDAY_WINDOW_DAYS = 3;

export function computeDailySuggestion(input: ComputeInput): DailySuggestion {
  const { user, contacts, routines, recentRoutineDones, now } = input;
  const date = userLocalDate(user.timezone, now);

  const contactsToNudge = rankContacts(contacts, user.timezone, now);
  const routinesToNudge = rankRoutines(routines, recentRoutineDones, now);

  return {
    date,
    contactsToNudge: contactsToNudge.slice(0, MAX_CONTACTS),
    routinesToNudge: routinesToNudge.slice(0, MAX_ROUTINES),
  };
}

function rankContacts(
  contacts: ComputeContact[],
  timezone: string,
  now: Date,
): ContactNudge[] {
  const birthdayBumps: ContactNudge[] = [];
  const overdue: Array<ContactNudge & { ratio: number }> = [];

  for (const c of contacts) {
    if (c.birthday) {
      const d = daysUntilAnnual(c.birthday, timezone, now);
      if (d <= BIRTHDAY_WINDOW_DAYS) {
        birthdayBumps.push({
          contactId: c.id,
          name: c.name,
          daysSinceLast: daysSinceLast(c, now),
          reason: "birthday_soon",
        });
        continue;
      }
    }
    const since = daysSinceLast(c, now);
    if (since >= c.targetFrequencyDays) {
      overdue.push({
        contactId: c.id,
        name: c.name,
        daysSinceLast: since,
        reason: "overdue",
        ratio: since / Math.max(c.targetFrequencyDays, 1),
      });
    }
  }

  overdue.sort((a, b) => b.ratio - a.ratio);
  return [
    ...birthdayBumps,
    ...overdue.map(({ ratio: _ratio, ...n }) => n),
  ];
}

function daysSinceLast(c: ComputeContact, now: Date): number {
  const reference = c.lastCheckInAt ?? c.createdAt;
  return Math.max(0, daysBetween(reference, now));
}

function rankRoutines(
  routines: ComputeRoutine[],
  recentDones: Array<{ routineId: string; createdAt: Date }>,
  now: Date,
): RoutineNudge[] {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const out: Array<{ nudge: RoutineNudge; priority: number }> = [];

  for (const r of routines) {
    if (r.frequencyType === "daily") {
      const last = r.lastDoneAt;
      const isStaleToday =
        last === null || daysBetween(last, now) >= 1;
      if (isStaleToday) {
        out.push({
          nudge: {
            routineId: r.id,
            name: r.name,
            reason: "due_today",
          },
          priority: 100 + (last ? daysBetween(last, now) : 999),
        });
      }
      continue;
    }
    if (r.frequencyType === "weekly") {
      const completions = recentDones.filter(
        (e) => e.routineId === r.id && e.createdAt >= sevenDaysAgo,
      ).length;
      if (completions < r.frequencyValue) {
        out.push({
          nudge: {
            routineId: r.id,
            name: r.name,
            reason: "behind_weekly_target",
          },
          priority: 50 + (r.frequencyValue - completions),
        });
      }
      continue;
    }
    // custom: frequencyValue = days between
    const reference = r.lastDoneAt ?? r.createdAt;
    const since = daysBetween(reference, now);
    if (since >= r.frequencyValue) {
      out.push({
        nudge: {
          routineId: r.id,
          name: r.name,
          reason: "custom_overdue",
        },
        priority: since / Math.max(r.frequencyValue, 1),
      });
    }
  }

  out.sort((a, b) => b.priority - a.priority);
  return out.map((o) => o.nudge);
}
