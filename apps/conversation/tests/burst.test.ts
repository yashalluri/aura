import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitIntoBursts, burstDelayMs } from "../src/lib/burst.js";

describe("splitIntoBursts", () => {
  it("splits on blank lines", () => {
    const input = "yo\n\nwait\n\nu actually went??";
    const bursts = splitIntoBursts(input);
    assert.deepEqual(bursts, ["yo", "wait", "u actually went??"]);
  });

  it("handles a single line by returning one burst", () => {
    const bursts = splitIntoBursts("ok");
    assert.deepEqual(bursts, ["ok"]);
  });

  it("falls back to sentence split when no blank lines and multiple sentences", () => {
    const input = "yo what's up. how are you. been a sec.";
    const bursts = splitIntoBursts(input);
    assert.ok(bursts.length >= 2, "should split a wall-of-text into multiple bursts");
  });

  it("caps at 4 bursts", () => {
    const input = "one\n\ntwo\n\nthree\n\nfour\n\nfive\n\nsix";
    const bursts = splitIntoBursts(input);
    assert.equal(bursts.length, 4);
    assert.ok(bursts[3]?.includes("four"), "remaining bursts merge into last");
  });

  it("trims whitespace around each burst", () => {
    const input = "  hi  \n\n  there  ";
    const bursts = splitIntoBursts(input);
    assert.deepEqual(bursts, ["hi", "there"]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(splitIntoBursts(""), []);
    assert.deepEqual(splitIntoBursts("   "), []);
  });

  it("breaks an oversized single burst into pieces", () => {
    const longBurst = "this is a much longer single burst that exceeds the soft word cap and should be split into smaller pieces to feel like real texting cadence";
    const bursts = splitIntoBursts(longBurst);
    assert.ok(bursts.length > 1, "oversized burst should be broken up");
  });
});

describe("burstDelayMs", () => {
  it("returns a delay in the 300-800ms range", () => {
    for (let i = 0; i < 20; i++) {
      const d = burstDelayMs();
      assert.ok(d >= 300 && d < 800, `delay ${d} out of expected range`);
    }
  });
});
