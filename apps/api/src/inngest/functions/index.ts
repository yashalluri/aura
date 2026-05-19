import type { InngestFunction } from "inngest";
import { dailyCheckinScheduler, dailyCheckinSender } from "./dailyCheckin.js";

export const functions: InngestFunction.Any[] = [
  dailyCheckinScheduler,
  dailyCheckinSender,
];
