import type { FastifyBaseLogger } from "fastify";
import * as api from "../lib/apiClient.js";
import { formatDailyCheckin } from "../llm/aura.js";
import { sendSms } from "../lib/twilio.js";

// Track which users we've already sent to today (localDate → Set<userId>)
const sentToday = new Map<string, Set<string>>();

/**
 * Start the outbound morning message cron.
 * Runs every 15 minutes, checks each user's checkInHour against their local time.
 *
 * NOTE: This is a simplified v1 that fetches users from the API.
 * We don't have a "list all users" endpoint yet, so for now this is
 * triggered manually via /send-checkin/:phone or by the API-side cron.
 *
 * For v1, we add a manual trigger endpoint instead of a full cron.
 */
export function startOutboundCron(log: FastifyBaseLogger): { stop: () => void } {
  // For v1, the API-side cron handles scheduling.
  // The SMS service provides a way to send the formatted message on demand.
  log.info("outbound cron: ready (manual trigger mode for v1)");

  return {
    stop: () => {
      log.info("outbound cron: stopped");
    },
  };
}

/**
 * Send the daily check-in message to a specific user.
 * Called by the webhook when user says "checkin" or by a future cron.
 */
export async function sendDailyCheckin(
  phone: string,
  log: FastifyBaseLogger,
): Promise<string> {
  const user = await api.getUserByPhone(phone);

  // Idempotency: skip if already sent today
  const { suggestion } = await api.getDailyCheckin(user.id);
  const dateKey = suggestion.date;
  const sent = sentToday.get(dateKey);
  if (sent?.has(user.id)) {
    log.info({ userId: user.id, date: dateKey }, "already sent today, skipping");
    return "Already sent your check-in for today!";
  }

  const message = await formatDailyCheckin(suggestion, user);
  await sendSms(phone, message);

  // Track sent
  if (!sentToday.has(dateKey)) {
    // Clean up old dates
    for (const [key] of sentToday) {
      if (key !== dateKey) sentToday.delete(key);
    }
    sentToday.set(dateKey, new Set());
  }
  sentToday.get(dateKey)!.add(user.id);

  log.info({ userId: user.id, phone, date: dateKey }, "daily check-in sent");
  return message;
}
