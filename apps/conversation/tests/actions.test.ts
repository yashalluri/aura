// Action handler tests — pure logic only. Stubs the api client + openai
// behind globalThis.fetch so we don't hit the network.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { executeAction } from "../src/lib/actions.js";

interface FetchCall {
  method: string;
  url: string;
  body?: unknown;
}

let fetchCalls: FetchCall[];
let fetchResponses: Map<string, { status: number; body: unknown }>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = new Map();
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    fetchCalls.push({ method, url, body });

    // Match by path suffix → response.
    for (const [pattern, r] of fetchResponses) {
      if (url.includes(pattern)) {
        return {
          status: r.status,
          ok: r.status >= 200 && r.status < 300,
          json: async () => r.body,
        } as Response;
      }
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({}),
    } as Response;
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("executeAction: remember_fact", () => {
  it("POSTs to /memories with the fact", async () => {
    fetchResponses.set("/memories", { status: 201, body: { id: "m1" } });
    const result = await executeAction(
      { action: "remember_fact", kind: "fact", content: "user prefers iced coffee" },
      "user_1",
      [],
      [],
    );
    assert.equal(result, null);
    const memoryCall = fetchCalls.find((c) => c.url.includes("/memories") && c.method === "POST");
    assert.ok(memoryCall);
    assert.equal((memoryCall!.body as { content: string }).content, "user prefers iced coffee");
  });
});

describe("executeAction: schedule_nudge", () => {
  it("POSTs to /nudges with parsed date", async () => {
    fetchResponses.set("/nudges", { status: 201, body: { id: "n1" } });
    const result = await executeAction(
      {
        action: "schedule_nudge",
        when: "2026-06-01T19:00:00Z",
        kind: "reminder",
        payload: { about: "call mom" },
      },
      "user_1",
      [],
      [],
    );
    assert.equal(result, null);
    const nudgeCall = fetchCalls.find((c) => c.url.includes("/nudges") && c.method === "POST");
    assert.ok(nudgeCall);
    assert.equal((nudgeCall!.body as { kind: string }).kind, "reminder");
  });

  it("returns a friendly error for unparseable dates", async () => {
    const result = await executeAction(
      {
        action: "schedule_nudge",
        when: "definitely-not-a-date",
        kind: "reminder",
      },
      "user_1",
      [],
      [],
    );
    assert.ok(result);
    assert.ok(result!.some((b) => b.includes("didn't parse")));
  });
});

describe("executeAction: set_goal", () => {
  it("POSTs to /goals", async () => {
    fetchResponses.set("/goals", { status: 201, body: { id: "g1" } });
    const result = await executeAction(
      {
        action: "set_goal",
        kind: "short",
        title: "ship aura v1",
        why: "to test the moonshot",
      },
      "user_1",
      [],
      [],
    );
    assert.equal(result, null);
    const goalCall = fetchCalls.find((c) => c.url.includes("/goals") && c.method === "POST");
    assert.ok(goalCall);
    assert.equal((goalCall!.body as { title: string }).title, "ship aura v1");
  });
});

describe("executeAction: recall", () => {
  it("returns memory results as bursts", async () => {
    fetchResponses.set("/memories/retrieve", {
      status: 200,
      body: [
        { id: "m1", content: "user has a sister Maya" },
        { id: "m2", content: "user trains for half marathon" },
      ],
    });
    const result = await executeAction(
      { action: "recall", query: "family" },
      "user_1",
      [],
      [],
    );
    assert.ok(result);
    assert.ok(result!.some((b) => b.includes("Maya")));
  });

  it("returns a 'nothing found' message when memory is empty", async () => {
    fetchResponses.set("/memories/retrieve", { status: 200, body: [] });
    const result = await executeAction(
      { action: "recall", query: "this never happened" },
      "user_1",
      [],
      [],
    );
    assert.ok(result);
    assert.ok(result!.some((b) => b.toLowerCase().includes("nothing")));
  });
});

describe("executeAction: summarize_relationship", () => {
  it("returns memories about the named contact", async () => {
    fetchResponses.set("/memories/retrieve", {
      status: 200,
      body: [
        { content: "Maya is the user's sister" },
        { content: "Maya lives in Brooklyn" },
      ],
    });
    const result = await executeAction(
      { action: "summarize_relationship", contactName: "Maya" },
      "user_1",
      [{ id: "c1", userId: "user_1", name: "Maya", relationshipType: "inner_circle", targetFrequencyDays: 7, lastCheckInAt: null, birthday: null, createdAt: "x" }],
      [],
    );
    assert.ok(result);
    assert.ok(result!.some((b) => b.includes("sister")));
    assert.ok(result!.some((b) => b.toLowerCase().includes("what i know about maya")));
  });
});
