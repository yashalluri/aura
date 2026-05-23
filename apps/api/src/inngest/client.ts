import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "aura-api",
});

export type AuraEvent =
  | { name: "aura/checkin.send"; data: { userId: string } }
  | { name: "aura/reachout.suggest"; data: { userId: string; contactId: string } }
  | { name: "aura/routine.nudge"; data: { userId: string; routineId: string } }
  | { name: "aura/memory.extract"; data: { userId: string; messageId: string } }
  | { name: "aura/integration.bootstrap"; data: { userId: string; app: string } }
  | { name: "aura/signal.event"; data: { userId: string; source: string; kind: string; occurredAt: string; summary: string } }
  | { name: "aura/agent.morning_brief"; data: { userId: string } }
  | { name: "aura/agent.relationship_pulse_user"; data: { userId: string } }
  | { name: "aura/agent.goal_review_user"; data: { userId: string } }
  | { name: "aura/agent.reengagement_user"; data: { userId: string } }
  | { name: "aura/agent.calendar_hygiene_user"; data: { userId: string } }
  | { name: "aura/specialist.planner"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.researcher"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.drafter"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.scheduler"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.deal_finder"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.advisor"; data: { userId: string; brief: unknown; triggerMessageId?: string } }
  | { name: "aura/specialist.coach"; data: { userId: string; brief: unknown; triggerMessageId?: string } };
