import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getHistory, addMessage, clearHistory, type Message } from "../src/lib/conversation.js";

const phone = "+15551234567";

function msg(role: "user" | "assistant", content: string, timestamp?: number): Message {
  return { role, content, timestamp: timestamp ?? Date.now() };
}

describe("conversation store", () => {
  beforeEach(() => {
    clearHistory(phone);
  });

  it("returns empty array for unknown phone", () => {
    assert.deepStrictEqual(getHistory("+10000000000"), []);
  });

  it("stores and retrieves messages", () => {
    addMessage(phone, msg("user", "hello"));
    addMessage(phone, msg("assistant", "hey!"));
    const h = getHistory(phone);
    assert.equal(h.length, 2);
    assert.equal(h[0]!.content, "hello");
    assert.equal(h[1]!.content, "hey!");
  });

  it("caps at 20 messages", () => {
    for (let i = 0; i < 25; i++) {
      addMessage(phone, msg("user", `msg-${i}`));
    }
    const h = getHistory(phone);
    assert.equal(h.length, 20);
    assert.equal(h[0]!.content, "msg-5");
    assert.equal(h[19]!.content, "msg-24");
  });

  it("clears history", () => {
    addMessage(phone, msg("user", "hi"));
    clearHistory(phone);
    assert.deepStrictEqual(getHistory(phone), []);
  });

  it("expires conversations after 4 hours of inactivity", () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000 - 1;
    addMessage(phone, msg("user", "old message", fourHoursAgo));
    const h = getHistory(phone);
    assert.equal(h.length, 0);
  });

  it("keeps conversations within 4 hour window", () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    addMessage(phone, msg("user", "recent", threeHoursAgo));
    const h = getHistory(phone);
    assert.equal(h.length, 1);
  });
});
