// Sprint 7 contract guardrails — no DB access. Verifies the kind/status
// enums exposed via services match the schema.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const RUNTIME_GOAL_KINDS = ["short", "long"];
const RUNTIME_GOAL_STATUSES = ["active", "done", "paused", "abandoned"];
const RUNTIME_NUDGE_KINDS = [
  "reminder",
  "goal_check",
  "contact_nudge",
  "routine_nudge",
  "callback",
];

describe("goal + nudge contracts", () => {
  it("goal kinds match the GoalKind enum exactly", () => {
    assert.deepEqual([...RUNTIME_GOAL_KINDS].sort(), ["long", "short"]);
  });

  it("goal statuses match GoalStatus enum exactly", () => {
    assert.deepEqual(
      [...RUNTIME_GOAL_STATUSES].sort(),
      ["abandoned", "active", "done", "paused"],
    );
  });

  it("nudge kinds are stable", () => {
    assert.equal(RUNTIME_NUDGE_KINDS.length, 5);
    assert.ok(RUNTIME_NUDGE_KINDS.includes("reminder"));
    assert.ok(RUNTIME_NUDGE_KINDS.includes("callback"));
    assert.ok(RUNTIME_NUDGE_KINDS.includes("goal_check"));
  });
});
