import type { ToneMode } from "@aura/shared";

export type ParsedAction =
  | { action: "add_contact"; name: string; targetFrequencyDays: number }
  | { action: "add_routine"; name: string; frequencyType: string; frequencyValue: number }
  | { action: "routine_done"; routineName: string }
  | { action: "contact_checkin"; contactName: string }
  | { action: "daily_checkin" }
  | { action: "set_tone"; tone: ToneMode }
  | { action: "set_name"; name: string }
  | { action: "set_timezone"; timezone: string };

export interface AuraResponse {
  text: string;
  action?: ParsedAction;
}
