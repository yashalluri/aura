import type { ToneMode } from "@aura/shared";

export type ParsedAction =
  // Existing actions (Sprint 1)
  | { action: "add_contact"; name: string; targetFrequencyDays: number }
  | { action: "add_routine"; name: string; frequencyType: string; frequencyValue: number }
  | { action: "routine_done"; routineName: string }
  | { action: "contact_checkin"; contactName: string }
  | { action: "daily_checkin" }
  | { action: "set_tone"; tone: ToneMode }
  | { action: "set_name"; name: string }
  | { action: "set_timezone"; timezone: string }
  // Sprint 7: agent capability expansion
  | { action: "remember_fact"; kind: "fact" | "preference" | "event" | "relationship" | "goal" | "value" | "pattern"; content: string; importance?: number }
  | { action: "recall"; query: string }
  | { action: "draft_text_to_contact"; contactName: string; intent: string }
  | { action: "schedule_nudge"; when: string; kind: "reminder" | "goal_check" | "contact_nudge" | "routine_nudge" | "callback"; payload?: Record<string, unknown> }
  | { action: "set_goal"; kind: "short" | "long"; title: string; why?: string; deadline?: string; milestones?: Array<{ title: string }> }
  | { action: "progress_goal"; goalId: string; note?: string; milestoneId?: string }
  | { action: "summarize_relationship"; contactName: string }
  // Sprint 8: specialty drafters
  | {
      action: "draft_hard_conversation";
      situation: string; // free-text: "breakup with rachel", "salary ask to manager", etc.
      flavors?: Array<"direct" | "soft" | "deadpan" | "vulnerable">;
    }
  // Sprint 11: dating coach
  | {
      action: "vibe_check";
      // The pasted conversation text from the dating app — multiple messages.
      conversation: string;
      // Optional: who's who. Defaults to assuming the user is the most recent sender.
      perspective?: "user" | "other";
    }
  | {
      action: "draft_dating_reply";
      // Pasted received message they want to reply to.
      received: string;
      // What they want to convey or the vibe they want.
      intent: string;
      flavors?: Array<"flirty" | "chill" | "witty" | "earnest">;
    }
  // Sprint 12: orchestrator + errands
  | {
      action: "spawn_agent";
      kind: "planner" | "researcher" | "drafter" | "scheduler" | "deal_finder" | "advisor" | "coach";
      brief: {
        goal: string;
        context?: string;
        deadline?: string;
        constraints?: string[];
      };
    }
  | {
      action: "errand";
      kind: "haircut" | "groceries" | "restaurant_booking" | "ride" | "gift" | "generic";
      details: string; // free-text describing what's needed
    };

export interface AuraResponse {
  text: string;
  action?: ParsedAction;
}
