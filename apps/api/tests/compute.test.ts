import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDailySuggestion, type ComputeInput } from "../src/scheduler/compute.js";

const daysAgo = (now: Date, n: number) =>
  new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function baseInput(now: Date): ComputeInput {
  return {
    user: { id: "u1", timezone: "UTC" },
    contacts: [],
    routines: [],
    recentRoutineDones: [],
    now,
  };
}

describe("computeDailySuggestion - contacts", () => {
  const now = new Date("2026-05-14T12:00:00Z");

  it("returns empty when no contacts or routines", () => {
    const result = computeDailySuggestion(baseInput(now));
    assert.equal(result.contactsToNudge.length, 0);
    assert.equal(result.routinesToNudge.length, 0);
    assert.equal(result.date, "2026-05-14");
  });

  it("skips contacts that aren't overdue", () => {
    const input = baseInput(now);
    input.contacts = [
      {
        id: "c1",
        name: "Fresh",
        targetFrequencyDays: 14,
        lastCheckInAt: daysAgo(now, 2),
        birthday: null,
        createdAt: daysAgo(now, 30),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.contactsToNudge.length, 0);
  });

  it("flags overdue contacts and sorts by overdue ratio desc", () => {
    const input = baseInput(now);
    input.contacts = [
      {
        id: "c1",
        name: "A",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(now, 8), // ratio 8/7 ≈ 1.14
        birthday: null,
        createdAt: daysAgo(now, 30),
      },
      {
        id: "c2",
        name: "B",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(now, 21), // ratio 3
        birthday: null,
        createdAt: daysAgo(now, 30),
      },
      {
        id: "c3",
        name: "C",
        targetFrequencyDays: 14,
        lastCheckInAt: daysAgo(now, 21), // ratio 1.5
        birthday: null,
        createdAt: daysAgo(now, 30),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.deepEqual(
      result.contactsToNudge.map((c) => c.name),
      ["B", "C", "A"],
    );
    assert.equal(result.contactsToNudge[0]?.reason, "overdue");
  });

  it("uses createdAt as the reference when lastCheckInAt is null", () => {
    const input = baseInput(now);
    input.contacts = [
      {
        id: "c1",
        name: "New",
        targetFrequencyDays: 7,
        lastCheckInAt: null,
        birthday: null,
        createdAt: daysAgo(now, 10),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.contactsToNudge.length, 1);
    assert.equal(result.contactsToNudge[0]?.daysSinceLast, 10);
  });

  it("caps to 5 contacts", () => {
    const input = baseInput(now);
    input.contacts = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      targetFrequencyDays: 7,
      lastCheckInAt: daysAgo(now, 8 + i),
      birthday: null,
      createdAt: daysAgo(now, 30),
    }));
    const result = computeDailySuggestion(input);
    assert.equal(result.contactsToNudge.length, 5);
  });

  it("bumps birthday-soon contacts above overdue ones", () => {
    const input = baseInput(now);
    const inTwoDays = new Date(now);
    inTwoDays.setUTCDate(inTwoDays.getUTCDate() + 2);
    input.contacts = [
      {
        id: "overdue",
        name: "Overdue",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(now, 60),
        birthday: null,
        createdAt: daysAgo(now, 90),
      },
      {
        id: "bday",
        name: "Bday",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(now, 2),
        birthday: inTwoDays,
        createdAt: daysAgo(now, 90),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.contactsToNudge[0]?.name, "Bday");
    assert.equal(result.contactsToNudge[0]?.reason, "birthday_soon");
  });

  it("does not bump birthdays beyond the 3-day window", () => {
    const input = baseInput(now);
    const farBday = new Date(now);
    farBday.setUTCDate(farBday.getUTCDate() + 10);
    input.contacts = [
      {
        id: "bday",
        name: "Bday",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(now, 2),
        birthday: farBday,
        createdAt: daysAgo(now, 90),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.contactsToNudge.length, 0);
  });
});

describe("computeDailySuggestion - routines", () => {
  const now = new Date("2026-05-14T12:00:00Z");

  it("flags daily routines not done today", () => {
    const input = baseInput(now);
    input.routines = [
      {
        id: "r1",
        name: "Read",
        frequencyType: "daily",
        frequencyValue: 1,
        lastDoneAt: daysAgo(now, 2),
        createdAt: daysAgo(now, 30),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 1);
    assert.equal(result.routinesToNudge[0]?.reason, "due_today");
  });

  it("does not flag daily routines done today", () => {
    const input = baseInput(now);
    input.routines = [
      {
        id: "r1",
        name: "Read",
        frequencyType: "daily",
        frequencyValue: 1,
        lastDoneAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        createdAt: daysAgo(now, 30),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 0);
  });

  it("flags weekly routines behind their trailing-7d target", () => {
    const input = baseInput(now);
    input.routines = [
      {
        id: "gym",
        name: "Gym",
        frequencyType: "weekly",
        frequencyValue: 3,
        lastDoneAt: daysAgo(now, 4),
        createdAt: daysAgo(now, 30),
      },
    ];
    input.recentRoutineDones = [
      { routineId: "gym", createdAt: daysAgo(now, 4) },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 1);
    assert.equal(result.routinesToNudge[0]?.reason, "behind_weekly_target");
  });

  it("does not flag weekly routines that already hit target", () => {
    const input = baseInput(now);
    input.routines = [
      {
        id: "gym",
        name: "Gym",
        frequencyType: "weekly",
        frequencyValue: 3,
        lastDoneAt: daysAgo(now, 1),
        createdAt: daysAgo(now, 30),
      },
    ];
    input.recentRoutineDones = [
      { routineId: "gym", createdAt: daysAgo(now, 1) },
      { routineId: "gym", createdAt: daysAgo(now, 3) },
      { routineId: "gym", createdAt: daysAgo(now, 5) },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 0);
  });

  it("flags custom routines when days since exceeds frequencyValue", () => {
    const input = baseInput(now);
    input.routines = [
      {
        id: "haircut",
        name: "Haircut",
        frequencyType: "custom",
        frequencyValue: 30,
        lastDoneAt: daysAgo(now, 45),
        createdAt: daysAgo(now, 90),
      },
    ];
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 1);
    assert.equal(result.routinesToNudge[0]?.reason, "custom_overdue");
  });

  it("caps to 4 routines", () => {
    const input = baseInput(now);
    input.routines = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      name: `R${i}`,
      frequencyType: "daily" as const,
      frequencyValue: 1,
      lastDoneAt: daysAgo(now, 2 + i),
      createdAt: daysAgo(now, 30),
    }));
    const result = computeDailySuggestion(input);
    assert.equal(result.routinesToNudge.length, 4);
  });
});

describe("computeDailySuggestion - date in user timezone", () => {
  it("uses the user's local date, not UTC", () => {
    // 2026-05-14 02:00 UTC = 2026-05-13 19:00 in LA
    const now = new Date("2026-05-14T02:00:00Z");
    const input: ComputeInput = {
      user: { id: "u1", timezone: "America/Los_Angeles" },
      contacts: [],
      routines: [],
      recentRoutineDones: [],
      now,
    };
    const result = computeDailySuggestion(input);
    assert.equal(result.date, "2026-05-13");
  });
});
