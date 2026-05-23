// Outbound policy — the single chokepoint every proactive message routes
// through. Pure function: takes context, returns allow/suppress decision.
//
// Enforced in apps/conversation/src/routes/internal.ts at the POST /internal/send
// boundary, so every agent (screen-time, morning brief, reach-out, drafts, …)
// gets governed for free without touching agent code.
//
// Rules (in evaluation order):
//   1. MUTE      — User.mutedUntil > now → suppress
//   2. QUIET     — now in user-local [quietStart, quietEnd) → suppress
//   3. DEDUPE    — same eventType (or dedupeKey) already sent today → suppress
//   4. COOLDOWN  — any non-exempt outbound within last 90 min → suppress
//   5. DAILY CAP — >= cap outbounds today → suppress

import { DateTime } from "luxon";

export interface PolicyUser {
  id: string;
  timezone: string;
  mutedUntil: Date | null;
  quietHoursStart: number | null; // 0-23, default 22 if null
  quietHoursEnd: number | null;   // 0-23, default 7 if null
}

export interface RecentOutboundRow {
  eventType: string;
  sentAt: Date;
  replyTo?: string | null;
}

export interface PolicyContext {
  user: PolicyUser;
  /** Outbound messages in roughly the last 24h, newest first. */
  recentOutbound: RecentOutboundRow[];
}

export interface PolicyConfig {
  dailyCap: number;
  cooldownMinutes: number;
  defaultQuietStart: number;
  defaultQuietEnd: number;
  /**
   * eventTypes that don't count toward cap or cooldown.
   *
   * Currently UNUSED in Phase 2 — live replies to inbound iMessages bypass
   * /internal/send entirely (spectrum.ts calls space.send() directly on the
   * inbound space). Reserved for future flows where an agent might want to
   * fire-back-immediately on a webhook event without burning the cap budget.
   * Don't add eventTypes here without confirming the routing actually flows
   * through /internal/send.
   */
  exemptFromGovernor: ReadonlySet<string>;
}

export const DEFAULT_POLICY: PolicyConfig = {
  dailyCap: 3,
  cooldownMinutes: 90,
  defaultQuietStart: 22,
  defaultQuietEnd: 7,
  exemptFromGovernor: new Set(["reply", "user_initiated_reply"]),
};

export type PolicyReason =
  | "muted"
  | "quiet_hours"
  | "dedupe"
  | "cooldown"
  | "daily_cap";

export interface PolicyDecision {
  allow: boolean;
  reason?: PolicyReason;
  /** When allow=true and a cooldown WOULD have hit, the time until next allowed send. */
  nextAllowedAt?: Date;
}

/**
 * Decide whether a single outbound is allowed right now.
 *
 * @param ctx        user + recent outbound history (caller fetches both)
 * @param eventType  the agent's event tag (e.g. "screentime_escalation_t1")
 * @param dedupeKey  optional explicit dedupe key; falls back to eventType
 * @param now        the moment we're evaluating (injected for testability)
 * @param config     optional policy overrides
 */
export function evaluate(
  ctx: PolicyContext,
  eventType: string,
  dedupeKey: string | undefined,
  now: Date,
  config: Partial<PolicyConfig> = {},
): PolicyDecision {
  const cfg: PolicyConfig = { ...DEFAULT_POLICY, ...config };

  // Exempt event types: bypass governor entirely (live replies).
  if (cfg.exemptFromGovernor.has(eventType)) {
    return { allow: true };
  }

  // 1. Mute
  if (ctx.user.mutedUntil && ctx.user.mutedUntil > now) {
    return { allow: false, reason: "muted" };
  }

  // 2. Quiet hours (computed in the user's local timezone)
  if (inQuietHours(ctx.user, now, cfg)) {
    return { allow: false, reason: "quiet_hours" };
  }

  const key = dedupeKey ?? eventType;
  const startOfLocalDay = startOfUserDay(ctx.user.timezone, now);

  // 3. Dedupe — same key already sent today
  const dupedToday = ctx.recentOutbound.some(
    (o) => o.sentAt >= startOfLocalDay && (o.eventType === key || o.eventType === eventType),
  );
  if (dupedToday) {
    return { allow: false, reason: "dedupe" };
  }

  // 4. Cooldown — any non-exempt outbound in last N minutes
  const cooldownCutoff = new Date(now.getTime() - cfg.cooldownMinutes * 60_000);
  const lastNonExempt = ctx.recentOutbound.find(
    (o) => !cfg.exemptFromGovernor.has(o.eventType),
  );
  if (lastNonExempt && lastNonExempt.sentAt > cooldownCutoff) {
    return {
      allow: false,
      reason: "cooldown",
      nextAllowedAt: new Date(
        lastNonExempt.sentAt.getTime() + cfg.cooldownMinutes * 60_000,
      ),
    };
  }

  // 5. Daily cap — count non-exempt outbounds sent today
  const sentTodayCount = ctx.recentOutbound.filter(
    (o) =>
      o.sentAt >= startOfLocalDay &&
      !cfg.exemptFromGovernor.has(o.eventType),
  ).length;
  if (sentTodayCount >= cfg.dailyCap) {
    return { allow: false, reason: "daily_cap" };
  }

  return { allow: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function inQuietHours(user: PolicyUser, now: Date, cfg: PolicyConfig): boolean {
  const start = user.quietHoursStart ?? cfg.defaultQuietStart;
  const end = user.quietHoursEnd ?? cfg.defaultQuietEnd;
  if (start === end) return false; // disabled

  const localHour = DateTime.fromJSDate(now)
    .setZone(user.timezone || "UTC")
    .hour;

  // Window can wrap midnight (e.g. 22 → 7).
  if (start < end) {
    return localHour >= start && localHour < end;
  }
  return localHour >= start || localHour < end;
}

function startOfUserDay(timezone: string, now: Date): Date {
  return DateTime.fromJSDate(now)
    .setZone(timezone || "UTC")
    .startOf("day")
    .toJSDate();
}
