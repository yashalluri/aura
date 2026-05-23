import type { InngestFunction } from "inngest";
import { dailyCheckinScheduler, dailyCheckinSender } from "./dailyCheckin.js";
import { memoryExtract } from "./memoryExtract.js";
import { memoryDecay } from "./memoryDecay.js";
import { agentScreenTimeEscalation } from "./agentScreenTimeEscalation.js";
import { agentReengagement, agentReengagementForUser } from "./agentReengagement.js";
import { agentEmailTriage, agentEmailDigest } from "./agentEmailTriage.js";
import { signalRetentionPurge } from "./signalRetention.js";
// Phase 6 — agent waves (each routes outbound through /internal/send so
// they're governed by Phase 2: quiet hours + cap + cooldown + mute).
import { agentMorningBrief } from "./agentMorningBrief.js";
import { agentCalendarHygiene, agentCalendarHygieneForUser } from "./agentCalendarHygiene.js";
import { agentCallSurface } from "./agentCallSurface.js";
import { agentGiftIntel } from "./agentGiftIntel.js";
import { agentLateNight } from "./agentLateNight.js";
import { agentRelationshipPulse, agentRelationshipPulseForUser } from "./agentRelationshipPulse.js";
import { agentSleepMorning, agentSleepWindDown } from "./agentSleepCoach.js";
import { agentSoftCommitments } from "./agentSoftCommitments.js";
import { agentTravelWishlist, agentTravelDeparturePrep } from "./agentTravelCopilot.js";
// Deferred (need Goal model in schema): agentOnThisDay, agentYearlyReview

export const functions: InngestFunction.Any[] = [
  dailyCheckinScheduler,
  dailyCheckinSender,
  memoryExtract,
  memoryDecay,
  // Phase 4 wave
  agentScreenTimeEscalation,
  agentReengagement,
  agentReengagementForUser,
  agentEmailTriage,
  agentEmailDigest,
  signalRetentionPurge,
  // Phase 6 wave (15 more agents)
  agentMorningBrief,
  agentCalendarHygiene,
  agentCalendarHygieneForUser,
  agentCallSurface,
  agentGiftIntel,
  agentLateNight,
  agentRelationshipPulse,
  agentRelationshipPulseForUser,
  agentSleepMorning,
  agentSleepWindDown,
  agentSoftCommitments,
  agentTravelWishlist,
  agentTravelDeparturePrep,
];
