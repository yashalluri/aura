// Group address classifier — does Aura respond to *this* message in *this* group?
//
// Group chats die if a bot replies to everything. Aura's policy by group:
//
//   address_only (default):  reply only if directly addressed (mention,
//                            name-prefix, reply-to-Aura).
//   implicit_call:           also reply when there's a clear coordination
//                            question Aura could help with (calendar, plan,
//                            restaurant), at most once per 10 messages.
//   quiet:                   reply only to @mentions.
//   host:                    Aura is the active host/moderator — reply
//                            liberally, run the cadence.
//
// Implementation: cheap regex first, gpt-5.4-nano fallback for ambiguous cases.

import OpenAI from "openai";
import { env } from "../env.js";

export type ResponsePolicy = "address_only" | "implicit_call" | "quiet" | "host";

export interface AddressContext {
  policy: ResponsePolicy;
  // The name Aura is configured to respond to in this group (default: "aura").
  auraName: string;
  // Recent messages for the LLM fallback (most recent last). Aura's own
  // messages should be flagged via `fromAura: true`.
  recent: Array<{ text: string; fromAura?: boolean; isReplyToAura?: boolean }>;
  // The text we're classifying.
  text: string;
  // Whether THIS message is a thread/reply to a prior Aura message (iMessage
  // reply-to-message feature).
  isReplyToAura?: boolean;
}

export interface ClassifyResult {
  shouldRespond: boolean;
  confidence: number; // 0-1
  reason: string;
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Names + prefixes that count as direct address.
function buildAddressPatterns(name: string): RegExp[] {
  const lower = name.toLowerCase();
  return [
    new RegExp(`@${lower}\\b`, "i"),
    new RegExp(`(^|\\s|[,.!?:])(hey|yo|hi|hii|hello|ok|so)\\s+${lower}\\b`, "i"),
    new RegExp(`(^|\\s)${lower}\\s*[,?]`, "i"),
    new RegExp(`^${lower}\\b`, "i"),
  ];
}

// Coordination words that hint Aura *could* help — used in implicit_call mode.
const COORDINATION_HINTS = /\b(plan|planning|schedule|book|reschedule|when|where|what time|dinner|lunch|brunch|drinks|hang|trip|meet|calendar|free|busy|saturday|sunday|tonight|tomorrow|next week)\b/i;

/**
 * Classify whether Aura should respond. Cheap regex fast-path covers ~90% of
 * cases. Ambiguous cases (no explicit address, but coordination hint with
 * implicit_call policy) fall through to a `gpt-5.4-nano` decision.
 */
export async function classify(ctx: AddressContext): Promise<ClassifyResult> {
  if (ctx.policy === "host") {
    return { shouldRespond: true, confidence: 0.9, reason: "host mode — always on" };
  }

  if (ctx.isReplyToAura) {
    return { shouldRespond: true, confidence: 0.95, reason: "explicit reply-to-Aura" };
  }

  const patterns = buildAddressPatterns(ctx.auraName);
  if (patterns.some((p) => p.test(ctx.text))) {
    return { shouldRespond: true, confidence: 0.95, reason: "direct address pattern" };
  }

  if (ctx.policy === "quiet" || ctx.policy === "address_only") {
    return { shouldRespond: false, confidence: 0.9, reason: "not directly addressed" };
  }

  // implicit_call: don't respond more than once per 10 messages.
  let recentAuraIdx = -1;
  for (let i = ctx.recent.length - 1; i >= 0; i--) {
    if (ctx.recent[i]?.fromAura) {
      recentAuraIdx = i;
      break;
    }
  }
  const sinceLastAura = recentAuraIdx === -1 ? Infinity : ctx.recent.length - 1 - recentAuraIdx;
  if (sinceLastAura < 10) {
    return {
      shouldRespond: false,
      confidence: 0.85,
      reason: `implicit_call cooldown (last Aura msg ${sinceLastAura} messages ago)`,
    };
  }

  // Coordination keyword hint — if no hint, definitely don't volunteer.
  if (!COORDINATION_HINTS.test(ctx.text)) {
    return {
      shouldRespond: false,
      confidence: 0.7,
      reason: "implicit_call without coordination hint",
    };
  }

  // Fall through to LLM for the ambiguous case.
  return classifyLLM(ctx);
}

const NANO_MODEL = "gpt-5.4-nano";

async function classifyLLM(ctx: AddressContext): Promise<ClassifyResult> {
  const transcript = ctx.recent
    .slice(-10)
    .map((m) => `${m.fromAura ? "AURA" : "USER"}: ${m.text}`)
    .join("\n");
  const prompt = `A group chat is happening. The AI assistant "${ctx.auraName}" is in the chat but doesn't reply to every message — only when directly addressed OR when a coordination question lands that ${ctx.auraName} could clearly help with (planning, scheduling, deciding).

Recent messages (most recent last):
${transcript}

Latest message: "${ctx.text}"

Decide: should ${ctx.auraName} speak now? Return JSON: {"should_respond": bool, "confidence": 0-1, "reason": "short why"}.
Default to NOT responding unless clearly addressed or coordination-helpful.`;

  try {
    const completion = await openai.chat.completions.create({
      model: NANO_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? '{"should_respond":false,"confidence":0.5,"reason":"parse fallback"}';
    const parsed = JSON.parse(raw) as { should_respond?: boolean; confidence?: number; reason?: string };
    return {
      shouldRespond: Boolean(parsed.should_respond),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: parsed.reason ?? "llm-classified",
    };
  } catch (err) {
    return {
      shouldRespond: false,
      confidence: 0.5,
      reason: `classifier error, defaulting silent: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
