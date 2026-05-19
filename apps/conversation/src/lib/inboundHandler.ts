import type { FastifyBaseLogger } from "fastify";
import * as api from "./apiClient.js";
import { generateResponse } from "../llm/aura.js";
import { executeAction } from "./actions.js";
import { getHistory, addMessage } from "./conversation.js";

/**
 * Channel-agnostic inbound message handler. Returns the reply text.
 * Called by every channel adapter (iMessage today; voice eventually).
 */
export async function handleInbound(
  from: string,
  text: string,
  log: FastifyBaseLogger,
): Promise<string> {
  log.info({ from, text }, "inbound message");

  const user = await api.getOrCreateUser(from);
  const [contacts, routines] = await Promise.all([
    api.getContacts(user.id),
    api.getRoutines(user.id),
  ]);
  const history = getHistory(from);

  const auraResponse = await generateResponse(
    text,
    user,
    contacts,
    routines,
    history,
  );

  let replyText = auraResponse.text;
  if (auraResponse.action) {
    try {
      const actionResult = await executeAction(
        auraResponse.action,
        user.id,
        contacts,
        routines,
      );
      if (actionResult) replyText = actionResult;
    } catch (err) {
      log.error({ err, action: auraResponse.action }, "action failed");
    }
  }

  if (!user.isOnboarded) {
    const [fresh, freshContacts, freshRoutines] = await Promise.all([
      api.getUser(user.id),
      api.getContacts(user.id),
      api.getRoutines(user.id),
    ]);
    if (fresh.name && (freshContacts.length > 0 || freshRoutines.length > 0)) {
      await api.updateUser(user.id, { isOnboarded: true });
      log.info({ userId: user.id }, "user onboarded");
    }
  }

  addMessage(from, { role: "user", content: text, timestamp: Date.now() });
  addMessage(from, { role: "assistant", content: replyText, timestamp: Date.now() });

  return replyText;
}
