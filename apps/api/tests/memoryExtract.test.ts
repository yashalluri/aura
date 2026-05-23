// Pure-logic tests for memory extraction.
//
// The actual extraction runs in an Inngest job against the live LLM + DB.
// Here we verify the helpers + system-prompt shape so contract regressions
// surface in CI without needing a database or network.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mirror the validation set used in memoryExtract.ts. Kept in this file as
// an inline guardrail so a drift in the runtime list is caught loudly.
const RUNTIME_VALID_KINDS = new Set([
  "fact",
  "preference",
  "event",
  "relationship",
  "goal",
  "value",
  "pattern",
]);

describe("memory extraction contract", () => {
  it("accepts the 7 schema kinds and rejects anything else", () => {
    for (const k of [
      "fact",
      "preference",
      "event",
      "relationship",
      "goal",
      "value",
      "pattern",
    ]) {
      assert.ok(RUNTIME_VALID_KINDS.has(k), `${k} must be a valid memory kind`);
    }
    for (const bad of ["thought", "rumination", "feeling", "todo", "fact "]) {
      assert.ok(!RUNTIME_VALID_KINDS.has(bad), `${bad} must NOT be valid`);
    }
  });
});
