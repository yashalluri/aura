import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/integrations/normalize.js";

describe("normalize: google_calendar", () => {
  it("turns calendar events into normalized signals", () => {
    const raw = {
      events: [
        {
          id: "evt1",
          summary: "Lunch with Maya",
          start: { dateTime: "2026-06-01T13:00:00Z" },
          end: { dateTime: "2026-06-01T14:00:00Z" },
          attendees: [{ displayName: "Maya Chen" }],
        },
      ],
    };
    const out = normalize("google_calendar", raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.kind, "calendar.event");
    assert.ok(out[0]!.summary.includes("Lunch with Maya"));
    assert.ok(out[0]!.summary.includes("Maya Chen"));
  });

  it("skips events without a start time", () => {
    const raw = { events: [{ summary: "Missing start" }] };
    const out = normalize("google_calendar", raw);
    assert.equal(out.length, 0);
  });

  it("accepts both bare-array and {events:[]} shapes", () => {
    const bare = [{ summary: "X", start: { dateTime: "2026-06-01T13:00:00Z" } }];
    assert.equal(normalize("google_calendar", bare).length, 1);
  });
});

describe("normalize: spotify", () => {
  it("turns recently-played into track signals", () => {
    const raw = {
      items: [
        {
          played_at: "2026-05-19T22:00:00Z",
          track: { name: "Hold On", artists: [{ name: "Justin Bieber" }] },
        },
      ],
    };
    const out = normalize("spotify", raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.kind, "spotify.track_played");
    assert.ok(out[0]!.summary.includes("Hold On"));
    assert.ok(out[0]!.summary.includes("Justin Bieber"));
  });
});

describe("normalize: apple_health", () => {
  it("explodes daily aggregate into per-metric signals", () => {
    const raw = {
      days: [
        {
          date: "2026-05-19",
          steps: 8234,
          workouts: [{ type: "Run", durationMin: 32, startedAt: "2026-05-19T07:30:00Z" }],
          sleep: { totalHours: 7.4, bedtime: "23:14", wake: "06:38" },
        },
      ],
    };
    const out = normalize("apple_health", raw);
    const kinds = out.map((e) => e.kind).sort();
    assert.deepEqual(kinds, ["health.sleep", "health.steps", "health.workout"]);
    const workout = out.find((e) => e.kind === "health.workout");
    assert.ok(workout!.summary.includes("Run"));
  });
});

describe("normalize: apple_phone_log", () => {
  it("formats missed calls vs in/out calls correctly", () => {
    const raw = {
      calls: [
        {
          startedAt: "2026-05-19T12:00:00Z",
          durationSec: 0,
          direction: "missed",
          contactName: "Mom",
        },
        {
          startedAt: "2026-05-19T13:00:00Z",
          durationSec: 180,
          direction: "outgoing",
          contactName: "Maya",
        },
      ],
    };
    const out = normalize("apple_phone_log", raw);
    assert.equal(out.length, 2);
    assert.equal(out[0]!.kind, "phone.missed");
    assert.ok(out[0]!.summary.includes("Mom"));
    assert.equal(out[1]!.kind, "phone.outgoing");
    assert.ok(out[1]!.summary.includes("3min"));
    assert.ok(out[1]!.summary.includes("Maya"));
  });
});

describe("normalize: screen time", () => {
  it("turns sessions into screentime.session signals", () => {
    const raw = {
      sessions: [
        {
          app: "Instagram",
          startedAt: "2026-05-19T20:00:00Z",
          endedAt: "2026-05-19T20:22:00Z",
          durationSec: 22 * 60,
        },
      ],
    };
    const out = normalize("apple_screen_time", raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.kind, "screentime.session");
    assert.ok(out[0]!.summary.includes("Instagram"));
    assert.ok(out[0]!.summary.includes("22min"));
  });
});

describe("normalize: notes", () => {
  it("captures title + body", () => {
    const raw = {
      notes: [{ id: "n1", title: "Goals", body: "ship aura v1 by Q3", updatedAt: "2026-05-19T10:00:00Z" }],
    };
    const out = normalize("apple_notes", raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.kind, "notes.entry");
    assert.ok(out[0]!.summary.includes("Goals"));
  });
});

describe("normalize: contacts (no signals)", () => {
  it("returns empty array — contacts seed entities, not signals", () => {
    const out = normalize("google_contacts", { connections: [{ names: [{ displayName: "Maya" }] }] });
    assert.deepEqual(out, []);
  });
});
