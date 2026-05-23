import type { InngestFunction } from "inngest";
import { dailyCheckinScheduler, dailyCheckinSender } from "./dailyCheckin.js";
import { memoryExtract } from "./memoryExtract.js";
import { memoryDecay } from "./memoryDecay.js";
import { agentScreenTimeEscalation } from "./agentScreenTimeEscalation.js";
import { agentReengagement, agentReengagementForUser } from "./agentReengagement.js";
import { agentEmailTriage, agentEmailDigest } from "./agentEmailTriage.js";
import { signalRetentionPurge } from "./signalRetention.js";

export const functions: InngestFunction.Any[] = [
  dailyCheckinScheduler,
  dailyCheckinSender,
  memoryExtract,
  memoryDecay,
  // Phase 4 — initial agent wave (behind the Phase 2 governor via /internal/send)
  agentScreenTimeEscalation,
  agentReengagement,
  agentReengagementForUser,
  agentEmailTriage,
  agentEmailDigest,
  signalRetentionPurge,
];
