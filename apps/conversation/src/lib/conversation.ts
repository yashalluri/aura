// Persistent conversation history — backed by Postgres via the API.
//
// Replaces the previous 4-hour in-process Map. Process restarts no longer lose
// context. The 4-hour expiry concept is also gone — the LLM gets the last 50
// messages every turn; old messages are archived via the memory layer.

import * as api from "./apiClient.js";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const HISTORY_LIMIT = 50;

/**
 * Fetch the recent conversation history for a user (oldest first).
 * Caller passes `userId` (not phone). The conversation worker already
 * resolves user from phone before reaching this.
 */
export async function getHistory(userId: string): Promise<Message[]> {
  try {
    const rows = await api.getMessages(userId, HISTORY_LIMIT);
    return rows.map((r) => ({
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      timestamp: new Date(r.createdAt).getTime(),
    }));
  } catch (err) {
    console.error("getHistory failed", err);
    return [];
  }
}

/**
 * Append a message (user or assistant) to persistent storage. Fire-and-forget
 * for performance — failures are logged but not thrown so we never block the
 * reply on a history write.
 */
export async function addMessage(userId: string, msg: Message): Promise<void> {
  try {
    await api.appendMessage(userId, {
      role: msg.role,
      content: msg.content,
    });
  } catch (err) {
    console.error("addMessage failed", err);
  }
}

/**
 * Purge all messages for a user. Used by /settings/delete.
 */
export async function clearHistory(userId: string): Promise<void> {
  try {
    await api.deleteMessages(userId);
  } catch (err) {
    console.error("clearHistory failed", err);
  }
}
