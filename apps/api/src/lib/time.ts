import { DateTime } from "luxon";

/**
 * Returns the user's current local DateTime in their IANA timezone.
 * Falls back to UTC if the zone is invalid.
 */
export function userNow(timezone: string, now: Date = new Date()): DateTime {
  const dt = DateTime.fromJSDate(now).setZone(timezone);
  return dt.isValid ? dt : DateTime.fromJSDate(now).toUTC();
}

/** YYYY-MM-DD in the user's local timezone. */
export function userLocalDate(timezone: string, now: Date = new Date()): string {
  return userNow(timezone, now).toISODate() ?? "1970-01-01";
}

/** Whole days from `from` to `to` (floor). Negative if `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Days until a recurring annual date (e.g., birthday) from today, in the user's tz.
 * Returns 0 if today, positive integer otherwise (always within [0, 365]).
 */
export function daysUntilAnnual(
  birthday: Date,
  timezone: string,
  now: Date = new Date(),
): number {
  const today = userNow(timezone, now).startOf("day");
  const b = DateTime.fromJSDate(birthday).setZone(timezone);
  let next = today.set({ month: b.month, day: b.day }).startOf("day");
  if (next < today) next = next.plus({ years: 1 });
  return Math.round(next.diff(today, "days").days);
}
