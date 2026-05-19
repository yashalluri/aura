import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractAction } from "../src/lib/extractAction.js";

describe("extractAction", () => {
  it("returns plain text when no JSON present", () => {
    const result = extractAction("Hey! How are you doing today?");
    assert.equal(result.text, "Hey! How are you doing today?");
    assert.equal(result.action, undefined);
  });

  it("extracts add_contact action from last line", () => {
    const raw = `Added your mom to your contacts!\n{"action":"add_contact","name":"Mom","targetFrequencyDays":3}`;
    const result = extractAction(raw);
    assert.equal(result.text, "Added your mom to your contacts!");
    assert.deepStrictEqual(result.action, {
      action: "add_contact",
      name: "Mom",
      targetFrequencyDays: 3,
    });
  });

  it("extracts routine_done action", () => {
    const raw = `Nice, marked your workout as done!\n{"action":"routine_done","routineName":"workout"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "Nice, marked your workout as done!");
    assert.deepStrictEqual(result.action, {
      action: "routine_done",
      routineName: "workout",
    });
  });

  it("extracts daily_checkin action", () => {
    const raw = `Here's what's on your plate today:\n{"action":"daily_checkin"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "Here's what's on your plate today:");
    assert.deepStrictEqual(result.action, { action: "daily_checkin" });
  });

  it("extracts set_tone action", () => {
    const raw = `bet switching to gen z mode rn 💀\n{"action":"set_tone","tone":"gen_z"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "bet switching to gen z mode rn 💀");
    assert.deepStrictEqual(result.action, { action: "set_tone", tone: "gen_z" });
  });

  it("handles multiline text with action on last line", () => {
    const raw = `Sure thing!\nI added a new routine for you.\n{"action":"add_routine","name":"meditate","frequencyType":"daily","frequencyValue":1}`;
    const result = extractAction(raw);
    assert.equal(result.text, "Sure thing!\nI added a new routine for you.");
    assert.deepStrictEqual(result.action, {
      action: "add_routine",
      name: "meditate",
      frequencyType: "daily",
      frequencyValue: 1,
    });
  });

  it("treats invalid JSON as regular text", () => {
    const raw = `Here's something:\n{not valid json}`;
    const result = extractAction(raw);
    assert.equal(result.text, `Here's something:\n{not valid json}`);
    assert.equal(result.action, undefined);
  });

  it("treats JSON without action key as regular text", () => {
    const raw = `Look at this:\n{"key":"value"}`;
    const result = extractAction(raw);
    assert.equal(result.text, `Look at this:\n{"key":"value"}`);
    assert.equal(result.action, undefined);
  });

  it("uses 'Got it!' as fallback when action is the only line", () => {
    const raw = `{"action":"daily_checkin"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "Got it!");
    assert.deepStrictEqual(result.action, { action: "daily_checkin" });
  });
});
