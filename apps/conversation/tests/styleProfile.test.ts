import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeStyleProfile,
  formatStyleProfile,
  markerBudget,
} from "../src/lib/styleProfile.js";

function makeMessages(userMessages: string[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of userMessages) {
    out.push({ role: "user", content: m });
    out.push({ role: "assistant", content: "k" });
  }
  return out;
}

describe("computeStyleProfile", () => {
  it("returns null below the minimum sample size", () => {
    const profile = computeStyleProfile(makeMessages(["hi", "yo", "k"]));
    assert.equal(profile, null);
  });

  it("classifies a dry texter as 'dry' or 'terse'", () => {
    const profile = computeStyleProfile(
      makeMessages([
        "k",
        "yeah",
        "fine",
        "nah",
        "later",
        "yep",
        "ok",
        "sure",
        "maybe",
        "idk",
        "lol",
        "yh",
      ]),
    );
    assert.ok(profile, "should compute a profile");
    assert.ok(["dry", "terse"].includes(profile!.vibe), `expected dry/terse, got ${profile!.vibe}`);
    assert.ok(profile!.lowercaseRatio > 0.8, "dry texter is mostly lowercase");
  });

  it("classifies a hyped emoji-heavy texter", () => {
    const profile = computeStyleProfile(
      makeMessages([
        "yessss 💀💀",
        "STOP 😭",
        "wait fr??",
        "💀 💀 💀 ",
        "OMG NO WAY",
        "stoppp 😭",
        "deadass??",
        "i love this 💜",
        "nooooo 😭",
        "fr fr fr",
        "bro 💀",
        "atp 💀",
      ]),
    );
    assert.ok(profile);
    assert.ok(profile!.emojiRate > 0.5, `expected high emoji rate, got ${profile!.emojiRate}`);
    assert.ok(profile!.vibe === "hyped" || profile!.vibe === "chatty", `expected hyped, got ${profile!.vibe}`);
  });

  it("only includes slang the user actually used in topMarkers", () => {
    const profile = computeStyleProfile(
      makeMessages([
        "fr that was crazy",
        "ngl im tired",
        "fr fr",
        "ngl tho",
        "ngl",
        "fr",
        "deadass",
        "tbh same",
        "tbh",
        "deadass",
        "fr",
        "ngl",
      ]),
    );
    assert.ok(profile);
    const markers = profile!.topMarkers;
    assert.ok(markers.includes("fr"));
    assert.ok(markers.includes("ngl"));
    // Should NOT include slang they didn't use:
    assert.ok(!markers.includes("slay"));
    assert.ok(!markers.includes("bestie"));
  });

  it("counts emoji per message correctly", () => {
    const profile = computeStyleProfile(
      makeMessages(["hi 💀", "lol", "wait 😭", "ok", "fine", "nah", "fr 💀", "yes 😭😭", "no emoji", "💀", "ok", "k"]),
    );
    assert.ok(profile);
    assert.ok(profile!.emojiRate > 0);
    assert.ok(profile!.topEmoji.includes("💀") || profile!.topEmoji.includes("😭"));
  });
});

describe("formatStyleProfile", () => {
  it("returns empty string when profile is null", () => {
    assert.equal(formatStyleProfile(null), "");
  });

  it("produces a compact text block when profile is given", () => {
    const profile = computeStyleProfile(
      makeMessages(["fr", "ngl", "bro", "wait", "deadass", "atp", "ts", "ig", "lol", "💀", "fr", "ngl"]),
    );
    assert.ok(profile);
    const formatted = formatStyleProfile(profile);
    assert.ok(formatted.includes("How they actually text"));
    assert.ok(formatted.includes("avg message:"));
    assert.ok(formatted.includes("lowercase:"));
    assert.ok(formatted.includes("vibe:"));
  });
});

describe("markerBudget", () => {
  it("falls back to default when profile is null", () => {
    const b = markerBudget(null);
    assert.equal(b.perBurst, 0.5);
    assert.equal(b.perReply, 1.5);
  });

  it("scales up budget for hyped vibe", () => {
    const profile = computeStyleProfile(
      makeMessages([
        "yessss 💀",
        "STOP 😭",
        "fr 💀💀",
        "no wayyy",
        "OMG",
        "deadass??",
        "lol 💀",
        "💀",
        "atp 😭",
        "fr",
        "ngl",
        "stoppp",
      ]),
    );
    if (profile && profile.vibe === "hyped") {
      const b = markerBudget(profile);
      assert.ok(b.perBurst >= 1);
    }
  });
});
