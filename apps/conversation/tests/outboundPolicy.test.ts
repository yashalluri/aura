import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  DEFAULT_POLICY,
  type PolicyContext,
  type PolicyUser,
} from "../src/lib/outboundPolicy.js";

const NOON_UTC = new Date("2026-05-22T12:00:00.000Z");
const NIGHT_UTC = new Date("2026-05-22T05:00:00.000Z"); // 05:00 UTC = before 7am in UTC

function makeUser(overrides: Partial<PolicyUser> = {}): PolicyUser {
  return {
    id: "u1",
    timezone: "UTC",
    mutedUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    ...overrides,
  };
}

function ctx(user: PolicyUser, recent: PolicyContext["recentOutbound"] = []): PolicyContext {
  return { user, recentOutbound: recent };
}

describe("outboundPolicy.evaluate", () => {
  it("allows when nothing's blocking", () => {
    const decision = evaluate(ctx(makeUser()), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("blocks when user is muted", () => {
    const user = makeUser({
      mutedUntil: new Date(NOON_UTC.getTime() + 60 * 60 * 1000),
    });
    const decision = evaluate(ctx(user), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "muted");
  });

  it("allows after mute expires", () => {
    const user = makeUser({
      mutedUntil: new Date(NOON_UTC.getTime() - 60 * 60 * 1000),
    });
    const decision = evaluate(ctx(user), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("blocks during default quiet hours (22-7) at 5am UTC", () => {
    const decision = evaluate(ctx(makeUser()), "daily_checkin", undefined, NIGHT_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "quiet_hours");
  });

  it("respects custom quiet hours", () => {
    const user = makeUser({ quietHoursStart: 0, quietHoursEnd: 11 });
    const decision = evaluate(ctx(user), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("handles non-wrapping quiet window", () => {
    const user = makeUser({ quietHoursStart: 9, quietHoursEnd: 17 });
    const decision = evaluate(ctx(user), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "quiet_hours");
  });

  it("treats quietStart === quietEnd as disabled", () => {
    const user = makeUser({ quietHoursStart: 12, quietHoursEnd: 12 });
    const decision = evaluate(ctx(user), "daily_checkin", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("dedupes a repeated eventType for the same day", () => {
    const user = makeUser();
    const recent = [
      { eventType: "screentime_escalation_t1", sentAt: new Date(NOON_UTC.getTime() - 6 * 60 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "screentime_escalation_t1", undefined, NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "dedupe");
  });

  it("dedupes when dedupeKey matches", () => {
    const user = makeUser();
    const recent = [
      { eventType: "x", sentAt: new Date(NOON_UTC.getTime() - 60 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "y", "x", NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "dedupe");
  });

  it("blocks on cooldown within 90 min", () => {
    const user = makeUser();
    const recent = [
      { eventType: "daily_checkin", sentAt: new Date(NOON_UTC.getTime() - 30 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "reach_out", undefined, NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "cooldown");
    assert.ok(decision.nextAllowedAt instanceof Date);
  });

  it("allows after cooldown elapses", () => {
    const user = makeUser();
    const recent = [
      { eventType: "daily_checkin", sentAt: new Date(NOON_UTC.getTime() - 100 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "reach_out", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("blocks on daily cap of 3", () => {
    const user = makeUser();
    // Three distinct event types sent earlier today, > 90 min ago to bypass cooldown
    const recent = [
      { eventType: "daily_checkin", sentAt: new Date(NOON_UTC.getTime() - 7 * 60 * 60 * 1000) },
      { eventType: "reach_out", sentAt: new Date(NOON_UTC.getTime() - 5 * 60 * 60 * 1000) },
      { eventType: "routine_nudge", sentAt: new Date(NOON_UTC.getTime() - 3 * 60 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "screentime_escalation_t2", undefined, NOON_UTC);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "daily_cap");
  });

  it("doesn't count exempt events toward cap or cooldown", () => {
    const user = makeUser();
    const recent = [
      { eventType: "reply", sentAt: new Date(NOON_UTC.getTime() - 30 * 60 * 1000) },
      { eventType: "reply", sentAt: new Date(NOON_UTC.getTime() - 60 * 60 * 1000) },
      { eventType: "reply", sentAt: new Date(NOON_UTC.getTime() - 90 * 60 * 1000) },
    ];
    const decision = evaluate(ctx(user, recent), "morning_brief", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("allows exempt event types through any gate", () => {
    const user = makeUser({
      mutedUntil: new Date(NOON_UTC.getTime() + 60 * 60 * 1000),
    });
    const decision = evaluate(ctx(user), "reply", undefined, NOON_UTC);
    assert.equal(decision.allow, true);
  });

  it("dedupe respects user-local day boundaries (not UTC)", () => {
    // Use quietHoursStart=quietHoursEnd to disable quiet-hours so we
    // isolate the day-boundary behavior of dedupe.
    const user = makeUser({
      timezone: "America/Los_Angeles",
      quietHoursStart: 0,
      quietHoursEnd: 0,
    });
    // Both timestamps are during the same LA day (2026-05-21), 4h apart.
    const lastSent = new Date("2026-05-22T01:00:00.000Z"); // 18:00 LA on 2026-05-21
    const now = new Date("2026-05-22T05:00:00.000Z");      // 22:00 LA on 2026-05-21 (still 2026-05-21 in LA)
    const recent = [{ eventType: "daily_checkin", sentAt: lastSent }];
    const decision = evaluate(ctx(user, recent), "daily_checkin", undefined, now);
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "dedupe");
  });

  it("default policy constants are exposed", () => {
    assert.equal(DEFAULT_POLICY.dailyCap, 3);
    assert.equal(DEFAULT_POLICY.cooldownMinutes, 90);
  });
});
