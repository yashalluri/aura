import type { InngestFunction } from "inngest";
import { dailyCheckinScheduler, dailyCheckinSender } from "./dailyCheckin.js";
import { memoryExtract } from "./memoryExtract.js";
import { memoryDecay } from "./memoryDecay.js";
import { integrationBootstrap } from "./integrationBootstrap.js";
import { agentMorningBrief } from "./agentMorningBrief.js";
import { agentRelationshipPulse, agentRelationshipPulseForUser } from "./agentRelationshipPulse.js";
import { agentScreenTimeEscalation } from "./agentScreenTimeEscalation.js";
import { nudgeDispatcher } from "./nudgeDispatcher.js";
import { agentGoalReview, agentGoalReviewForUser } from "./agentGoalReview.js";
import { agentReengagement, agentReengagementForUser } from "./agentReengagement.js";
import { agentLateNight } from "./agentLateNight.js";
import { agentCalendarHygiene, agentCalendarHygieneForUser } from "./agentCalendarHygiene.js";
import { agentEmailTriage, agentEmailDigest } from "./agentEmailTriage.js";
import { agentCallSurface } from "./agentCallSurface.js";
import { agentSleepMorning, agentSleepWindDown } from "./agentSleepCoach.js";
import { agentMoneyPulse } from "./agentMoneyPulse.js";
import { agentGiftIntel } from "./agentGiftIntel.js";
import { agentYearlyReview } from "./agentYearlyReview.js";
import { agentSoftCommitments } from "./agentSoftCommitments.js";
import { agentInsideJokes } from "./agentInsideJokes.js";
import { agentOnThisDay } from "./agentOnThisDay.js";
import { agentTravelWishlist, agentTravelDeparturePrep } from "./agentTravelCopilot.js";
import { agentPredictiveForecast } from "./agentPredictiveForecast.js";
import { specialistPlanner } from "./specialistPlanner.js";
import { specialistResearcher } from "./specialistResearcher.js";
import { specialistCoach } from "./specialistCoach.js";
import {
  specialistDrafter,
  specialistAdvisor,
  specialistScheduler,
  specialistDealFinder,
} from "./specialistMisc.js";

export const functions: InngestFunction.Any[] = [
  dailyCheckinScheduler,
  dailyCheckinSender,
  memoryExtract,
  memoryDecay,
  integrationBootstrap,
  agentMorningBrief,
  agentRelationshipPulse,
  agentRelationshipPulseForUser,
  agentScreenTimeEscalation,
  nudgeDispatcher,
  agentGoalReview,
  agentGoalReviewForUser,
  agentReengagement,
  agentReengagementForUser,
  agentLateNight,
  agentCalendarHygiene,
  agentCalendarHygieneForUser,
  agentEmailTriage,
  agentEmailDigest,
  agentCallSurface,
  agentSleepMorning,
  agentSleepWindDown,
  agentMoneyPulse,
  agentGiftIntel,
  agentYearlyReview,
  agentSoftCommitments,
  agentInsideJokes,
  agentOnThisDay,
  agentTravelWishlist,
  agentTravelDeparturePrep,
  agentPredictiveForecast,
  specialistPlanner,
  specialistResearcher,
  specialistCoach,
  specialistDrafter,
  specialistAdvisor,
  specialistScheduler,
  specialistDealFinder,
];
