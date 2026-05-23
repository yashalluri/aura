import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/llm/prompts.js";
import { extractAction } from "../src/lib/extractAction.js";
import type { ApiUser, ApiContact, ApiRoutine } from "../src/lib/apiClient.js";

function makeUser(overrides: Partial<ApiUser> = {}): ApiUser {
  return {
    id: "user_1",
    phoneNumber: "+15555550100",
    name: null,
    timezone: "UTC",
    checkInHour: 8,
    toneMode: "gen_z",
    isOnboarded: false,
    mutedUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const sampleContact: ApiContact = {
  id: "c1",
  userId: "user_1",
  name: "Mom",
  relationshipType: "inner_circle",
  targetFrequencyDays: 3,
  lastCheckInAt: null,
  birthday: null,
  createdAt: new Date().toISOString(),
};

const sampleRoutine: ApiRoutine = {
  id: "r1",
  userId: "user_1",
  name: "Gym",
  frequencyType: "weekly",
  frequencyValue: 3,
  lastDoneAt: null,
  createdAt: new Date().toISOString(),
};

describe("buildSystemPrompt", () => {
  it("returns new-user prompt when isOnboarded is false", () => {
    const prompt = buildSystemPrompt(makeUser(), [], []);
    assert.ok(prompt.includes("JUST met this person"));
    assert.ok(prompt.includes("set_name"));
    assert.ok(prompt.includes("set_timezone"));
    // Should NOT contain returning-user stuff
    assert.ok(!prompt.includes("User's contacts"));
  });

  it("returns returning-user prompt when isOnboarded is true", () => {
    const user = makeUser({ isOnboarded: true, name: "Yash" });
    const prompt = buildSystemPrompt(user, [sampleContact], [sampleRoutine]);
    assert.ok(prompt.includes("Yash"));
    assert.ok(prompt.includes("Mom"));
    assert.ok(prompt.includes("Gym"));
    // Should NOT contain new-user onboarding stuff
    assert.ok(!prompt.includes("just met this person"));
  });

  it("uses 'this person' when name is null for returning user", () => {
    const user = makeUser({ isOnboarded: true, name: null });
    const prompt = buildSystemPrompt(user, [], []);
    assert.ok(prompt.includes("this person"));
  });

  it("includes tone instructions for returning user", () => {
    const user = makeUser({ isOnboarded: true, toneMode: "millennial" });
    const prompt = buildSystemPrompt(user, [], []);
    assert.ok(prompt.includes("millennial"));
    assert.ok(prompt.includes("adulting"));
  });

  it("shows (none yet) when contacts/routines empty for returning user", () => {
    const user = makeUser({ isOnboarded: true, name: "Kai" });
    const prompt = buildSystemPrompt(user, [], []);
    assert.ok(prompt.includes("(none yet)"));
  });

  it("lists contacts in returning-user prompt", () => {
    const user = makeUser({ isOnboarded: true, name: "Kai" });
    const prompt = buildSystemPrompt(user, [sampleContact], []);
    assert.ok(prompt.includes("Mom"));
    assert.ok(prompt.includes("inner_circle"));
  });
});

describe("extractAction — new action types", () => {
  it("extracts set_name action", () => {
    const raw = `nice to meet u!\n{"action":"set_name","name":"Yash"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "nice to meet u!");
    assert.deepEqual(result.action, { action: "set_name", name: "Yash" });
  });

  it("extracts set_timezone action", () => {
    const raw = `bet ur in cali vibes\n{"action":"set_timezone","timezone":"America/Los_Angeles"}`;
    const result = extractAction(raw);
    assert.equal(result.text, "bet ur in cali vibes");
    assert.deepEqual(result.action, { action: "set_timezone", timezone: "America/Los_Angeles" });
  });
});
