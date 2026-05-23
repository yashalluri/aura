import type { FastifyBaseLogger } from "fastify";
import * as api from "./apiClient.js";
import { generateResponse } from "../llm/aura.js";
import { executeAction } from "./actions.js";
import { getHistory, addMessage } from "./conversation.js";

/**
 * Channel-agnostic inbound message handler.
 *
 * Flow:
 *  1. Resolve user
 *  2. Load history + contacts + routines + retrieved memories (in parallel)
 *  3. Persist the user's message *before* generating (so memory extraction has it)
 *  4. Generate Aura's reply with full context
 *  5. Execute action if any
 *  6. Persist the assistant's reply
 *  7. Return bursts to the channel adapter to send
 */
export async function handleInbound(
  from: string,
  text: string,
  log: FastifyBaseLogger,
): Promise<string[]> {
  log.info({ from, text }, "inbound message");

  const user = await api.getOrCreateUser(from);

  // Parallel context load
  const [contacts, routines, history, memories] = await Promise.all([
    api.getContacts(user.id),
    api.getRoutines(user.id),
    getHistory(user.id),
    // Retrieve memories relevant to the incoming message. Cold-start friendly:
    // if there are no memories, this returns [].
    api.retrieveMemories(user.id, text, 8).catch((err) => {
      log.warn({ err }, "memory retrieve failed; continuing without");
      return [] as api.ApiMemory[];
    }),
  ]);

  // Persist the inbound message *before* generating so the extraction job
  // gets the freshest window.
  await addMessage(user.id, { role: "user", content: text, timestamp: Date.now() });

  const auraResponse = await generateResponse(
    text,
    user,
    contacts,
    routines,
    history,
    memories,
  );

  let replyBursts = auraResponse.bursts;
  if (auraResponse.action) {
    try {
      const actionResult = await executeAction(
        auraResponse.action,
        user.id,
        contacts,
        routines,
      );
      if (actionResult && actionResult.length) replyBursts = actionResult;
    } catch (err) {
      log.error({ err, action: auraResponse.action }, "action failed");
    }
  }

  // Onboarding completion check — unchanged
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

  // Persist the assistant reply (combined, so the LLM sees the full thought
  // on the next turn). Bursts are sent separately to the user by the channel.
  await addMessage(user.id, {
    role: "assistant",
    content: replyBursts.join("\n\n"),
    timestamp: Date.now(),
  });

  return replyBursts;
}
