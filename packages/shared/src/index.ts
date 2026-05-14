export type RelationshipType =
  | "inner_circle"
  | "friend"
  | "acquaintance"
  | "other";

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "inner_circle",
  "friend",
  "acquaintance",
  "other",
] as const;

export type FrequencyType = "daily" | "weekly" | "custom";

export const FREQUENCY_TYPES: readonly FrequencyType[] = [
  "daily",
  "weekly",
  "custom",
] as const;

export type ToneMode = "neutral" | "millennial" | "gen_z";

export const TONE_MODES: readonly ToneMode[] = [
  "neutral",
  "millennial",
  "gen_z",
] as const;

export type ContactNudgeReason = "overdue" | "birthday_soon";

export interface ContactNudge {
  contactId: string;
  name: string;
  daysSinceLast: number;
  reason: ContactNudgeReason;
}

export type RoutineNudgeReason =
  | "due_today"
  | "behind_weekly_target"
  | "custom_overdue";

export interface RoutineNudge {
  routineId: string;
  name: string;
  reason: RoutineNudgeReason;
}

export interface DailySuggestion {
  /** YYYY-MM-DD in the user's local timezone */
  date: string;
  contactsToNudge: ContactNudge[];
  routinesToNudge: RoutineNudge[];
}
