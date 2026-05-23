import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify, type AddressContext } from "../src/lib/groupRouter.js";

function ctx(overrides: Partial<AddressContext> = {}): AddressContext {
  return {
    policy: "address_only",
    auraName: "aura",
    recent: [],
    text: "",
    ...overrides,
  };
}

describe("groupRouter classify (regex fast-path)", () => {
  it("host mode always responds", async () => {
    const r = await classify(ctx({ policy: "host", text: "anything" }));
    assert.equal(r.shouldRespond, true);
  });

  it("@mention triggers response", async () => {
    const r = await classify(ctx({ text: "yo @aura when are we eating" }));
    assert.equal(r.shouldRespond, true);
  });

  it("name-prefix triggers response", async () => {
    const r = await classify(ctx({ text: "aura, plan dinner pls" }));
    assert.equal(r.shouldRespond, true);
  });

  it("hey aura triggers response", async () => {
    const r = await classify(ctx({ text: "hey aura you there?" }));
    assert.equal(r.shouldRespond, true);
  });

  it("reply-to-Aura triggers response", async () => {
    const r = await classify(ctx({ text: "ok do that", isReplyToAura: true }));
    assert.equal(r.shouldRespond, true);
  });

  it("regular message does NOT trigger in address_only mode", async () => {
    const r = await classify(ctx({ text: "yo what's everyone doing tonight" }));
    assert.equal(r.shouldRespond, false);
  });

  it("regular message does NOT trigger in quiet mode", async () => {
    const r = await classify(ctx({ policy: "quiet", text: "any plans for the weekend?" }));
    assert.equal(r.shouldRespond, false);
  });

  it("implicit_call cooldown blocks volunteering too often", async () => {
    const recent: AddressContext["recent"] = [
      ...Array(5).fill({ text: "x" }),
      { text: "i can help", fromAura: true },
      ...Array(3).fill({ text: "y" }),
    ];
    const r = await classify(
      ctx({
        policy: "implicit_call",
        text: "plan something tomorrow?",
        recent,
      }),
    );
    assert.equal(r.shouldRespond, false);
    assert.ok(r.reason.includes("cooldown"));
  });
});
