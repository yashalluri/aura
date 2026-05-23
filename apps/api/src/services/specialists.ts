// Sub-agent registry — the Aura-as-orchestrator infrastructure.
//
// Aura is one face over many specialists. When the conversation worker
// emits `spawn_agent { kind, brief }`, we dispatch to the named specialist
// here. Each specialist:
//   - Runs as an Inngest function (so it can use step.run, sleep, retries)
//   - Receives the brief + user context
//   - Returns a string that goes back to the conversation worker as Aura's reply
//
// New specialists are added by declaring an entry below + an Inngest function
// that listens for `aura/specialist.<kind>`.

import { inngest } from "../inngest/client.js";

export type SpecialistKind =
  | "planner"        // multi-step plan (trip, birthday party, event)
  | "researcher"     // looks up factual stuff and summarizes
  | "drafter"        // long-form writes (emails, posts, statements)
  | "scheduler"      // calendar negotiation across multiple ppl
  | "deal_finder"    // pricing / availability scan (flights, hotels, restaurants)
  | "advisor"        // decision-making walk-through
  | "coach";         // accountability sprint over multiple days

export interface SpecialistBrief {
  goal: string;          // one-sentence outcome the user wants
  context?: string;      // anything the user already said that's relevant
  deadline?: string;     // ISO 8601 if time-sensitive
  constraints?: string[]; // budget, vibe, "no flying", etc.
}

export interface SpecialistRegistration {
  kind: SpecialistKind;
  description: string;
  estimateMs: number;     // expected latency p50
  needsIntegrations?: string[]; // composio app slugs required
}

export const SPECIALISTS: SpecialistRegistration[] = [
  {
    kind: "planner",
    description: "Plans multi-step events (trip, party, big day). Pulls calendar + memory + relationship graph.",
    estimateMs: 8000,
  },
  {
    kind: "researcher",
    description: "Web-research style lookup + summary. Best for facts, comparisons, current-events questions.",
    estimateMs: 6000,
  },
  {
    kind: "drafter",
    description: "Long-form writing — emails, posts, statements, applications.",
    estimateMs: 5000,
  },
  {
    kind: "scheduler",
    description: "Finds a time across N people's calendars. Drafts the proposal.",
    estimateMs: 7000,
    needsIntegrations: ["googlecalendar"],
  },
  {
    kind: "deal_finder",
    description: "Pricing/availability scan. v1: returns search guidance; v2: hooks into deal APIs.",
    estimateMs: 5000,
  },
  {
    kind: "advisor",
    description: "Decision walk-through — pros/cons across what we know about the user.",
    estimateMs: 4000,
  },
  {
    kind: "coach",
    description: "Multi-day accountability sprint with check-ins. Creates a NudgeSchedule series.",
    estimateMs: 3000,
  },
];

const ALLOWED_KINDS = new Set(SPECIALISTS.map((s) => s.kind));

export function isSpecialistKind(x: string): x is SpecialistKind {
  return ALLOWED_KINDS.has(x as SpecialistKind);
}

/**
 * Dispatch a specialist. Returns the inngest event id (the actual reply
 * comes back asynchronously via the conversation worker's /internal/send).
 */
export async function dispatchSpecialist(opts: {
  userId: string;
  kind: SpecialistKind;
  brief: SpecialistBrief;
  // The message id this dispatch is responding to (so the specialist can
  // reference the user's original message in its reply context).
  triggerMessageId?: string;
}): Promise<{ eventId: string }> {
  const result = await inngest.send({
    name: `aura/specialist.${opts.kind}` as const,
    data: {
      userId: opts.userId,
      brief: opts.brief,
      triggerMessageId: opts.triggerMessageId,
    },
  });
  return { eventId: Array.isArray(result.ids) ? result.ids[0]! : String(result) };
}
