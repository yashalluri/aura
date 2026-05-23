import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getHistory, addMessage, clearHistory } from "../src/lib/conversation.js";

// Conversation history is now API-backed. These tests stub fetch to verify
// that the conversation lib correctly delegates to the API.

const userId = "user_test_1";

interface FetchCall {
  method: string;
  url: string;
  body?: unknown;
}

let fetchCalls: FetchCall[];
let fetchResponse: { status: number; body: unknown };
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchResponse = { status: 200, body: [] };
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    fetchCalls.push({ method, url, body });
    return {
      status: fetchResponse.status,
      ok: fetchResponse.status >= 200 && fetchResponse.status < 300,
      json: async () => fetchResponse.body,
    } as Response;
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("conversation history (API-backed)", () => {
  it("getHistory returns mapped messages from the API (oldest first)", async () => {
    fetchResponse = {
      status: 200,
      body: [
        {
          id: "m1",
          userId,
          role: "user",
          content: "hi",
          channel: null,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
        {
          id: "m2",
          userId,
          role: "assistant",
          content: "hii",
          channel: null,
          createdAt: "2026-05-19T10:00:05.000Z",
        },
      ],
    };
    const history = await getHistory(userId);
    assert.equal(history.length, 2);
    assert.equal(history[0]!.role, "user");
    assert.equal(history[0]!.content, "hi");
    assert.equal(history[1]!.role, "assistant");
    assert.equal(history[1]!.content, "hii");
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0]!.url, new RegExp(`/users/${userId}/messages\\?limit=50$`));
    assert.equal(fetchCalls[0]!.method, "GET");
  });

  it("getHistory returns empty array on API failure", async () => {
    fetchResponse = { status: 500, body: { error: "boom" } };
    const history = await getHistory(userId);
    assert.deepEqual(history, []);
  });

  it("addMessage POSTs to the API", async () => {
    fetchResponse = {
      status: 201,
      body: { id: "m1", userId, role: "user", content: "hi", channel: null, createdAt: "x" },
    };
    await addMessage(userId, { role: "user", content: "hi", timestamp: Date.now() });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]!.method, "POST");
    assert.match(fetchCalls[0]!.url, new RegExp(`/users/${userId}/messages$`));
    assert.equal((fetchCalls[0]!.body as { content: string }).content, "hi");
  });

  it("clearHistory DELETEs from the API", async () => {
    fetchResponse = { status: 200, body: { deleted: 5 } };
    await clearHistory(userId);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]!.method, "DELETE");
  });

  it("addMessage failures are swallowed (never throws)", async () => {
    fetchResponse = { status: 500, body: { error: "boom" } };
    // Should not throw
    await addMessage(userId, { role: "user", content: "hi", timestamp: Date.now() });
    assert.ok(true);
  });
});
