import type { FastifyBaseLogger } from "fastify";
import OpenAI from "openai";
import * as api from "./apiClient.js";
import { classify } from "./groupRouter.js";
import { splitIntoBursts } from "./burst.js";
import { env } from "../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

// Recent group message buffer (in-process) — used to give the address
// classifier context. Group message *persistence* lives in the API
// (Message rows with groupSpaceId); this buffer is just for the rolling
// classifier window so we don't round-trip the DB every inbound.
interface BufferedMsg { text: string; fromAura?: boolean; author?: string }
const groupBuffers = new Map<string, BufferedMsg[]>();
const BUFFER_MAX = 15;

function pushBuffer(externalId: string, msg: BufferedMsg): BufferedMsg[] {
  const buf = groupBuffers.get(externalId) ?? [];
  buf.push(msg);
  while (buf.length > BUFFER_MAX) buf.shift();
  groupBuffers.set(externalId, buf);
  return buf;
}

export interface GroupInboundResult {
  shouldRespond: boolean;
  bursts: string[];
  reason: string;
}

/**
 * Handle an inbound message in a group context.
 *
 * @param externalId  Photon space id
 * @param ownerPhone  the phone of the user who added Aura (best-effort; if we
 *                    can't resolve the group yet, we create it lazily with the
 *                    sender as owner)
 * @param senderPhone the participant who sent this message
 * @param senderName  display name if Photon provides one
 * @param text        message text
 * @param auraName    the name Aura responds to in this group (default "aura")
 */
export async function handleGroupInbound(opts: {
  externalId: string;
  senderPhone: string;
  senderName?: string;
  text: string;
  log: FastifyBaseLogger;
}): Promise<GroupInboundResult> {
  const { externalId, senderPhone, senderName, text, log } = opts;

  // Resolve (or lazily create) the group. The first sender becomes owner if
  // the group doesn't exist yet — the real owner can be corrected via the API.
  let group = await api.getGroupByExternal(externalId).catch(() => null);
  if (!group) {
    // Need a user id for ownership; create/resolve the sender as a user.
    const ownerUser = await api.getOrCreateUser(senderPhone);
    group = await api
      .getOrCreateGroup({
        externalId,
        ownerId: ownerUser.id,
        responsePolicy: "address_only",
      })
      .catch(() => null);
    if (!group) {
      return { shouldRespond: false, bursts: [], reason: "group resolve failed" };
    }
    // Add the sender as the first participant.
    await api
      .addGroupParticipant(group.id, {
        externalHandle: senderPhone,
        displayName: senderName ?? senderPhone,
        userId: ownerUser.id,
        role: "owner",
      })
      .catch(() => undefined);
  }

  const buffer = pushBuffer(externalId, {
    text,
    author: senderName ?? senderPhone,
  });

  // Decide whether Aura speaks.
  const decision = await classify({
    policy: group.responsePolicy,
    auraName: "aura",
    recent: buffer.map((b) => ({ text: b.text, fromAura: b.fromAura })),
    text,
  });

  if (!decision.shouldRespond) {
    log.info({ externalId, reason: decision.reason }, "group: staying quiet");
    return { shouldRespond: false, bursts: [], reason: decision.reason };
  }

  // Build a group reply. Uses GROUP memories only — never personal 1:1 memory.
  const groupMemories = await api.listGroupMemories(group.id).catch(() => []);
  const memoryHints = groupMemories
    .slice(0, 8)
    .map((m) => `- [${m.kind}] ${m.content}`)
    .join("\n") || "(no group memories yet)";

  const recentTranscript = buffer
    .slice(-10)
    .map((b) => `${b.fromAura ? "aura" : b.author ?? "someone"}: ${b.text}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are Aura, a member of a group chat (not a 1:1 with one person).
You were just addressed. Reply to the GROUP, not one person.

Rules:
- Lowercase. Burst format (2-3 short messages, blank lines between).
- You know group context below. NEVER reveal anything you know about an
  individual from your private 1:1 chats — only what's shared here.
- Be useful + brief. If it's a coordination question (plans, scheduling),
  propose something concrete.
- Friend-group energy. No "How can I help the group today?".

Group memories (shared context — safe to use):
${memoryHints}`,
      },
      {
        role: "user",
        content: `Recent group messages:\n${recentTranscript}\n\nRespond to the latest message.`,
      },
    ],
    max_tokens: 250,
    temperature: 0.85,
  });

  const raw = completion.choices[0]?.message?.content ?? "yo";
  const bursts = splitIntoBursts(raw);
  pushBuffer(externalId, { text: bursts.join(" "), fromAura: true });

  return { shouldRespond: true, bursts, reason: decision.reason };
}
