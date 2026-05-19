import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "aura-api",
});

export type AuraEvent =
  | { name: "aura/checkin.send"; data: { userId: string } }
  | { name: "aura/reachout.suggest"; data: { userId: string; contactId: string } }
  | { name: "aura/routine.nudge"; data: { userId: string; routineId: string } };
