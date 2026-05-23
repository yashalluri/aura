import type { InngestFunction } from "inngest";
import { dailyCheckinScheduler, dailyCheckinSender } from "./dailyCheckin.js";
import { memoryExtract } from "./memoryExtract.js";
import { memoryDecay } from "./memoryDecay.js";

export const functions: InngestFunction.Any[] = [
  dailyCheckinScheduler,
  dailyCheckinSender,
  memoryExtract,
  memoryDecay,
];
