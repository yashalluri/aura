import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { DailySuggestion } from "@aura/shared";
import type { ApiUser, ApiContact, ApiRoutine, ApiMemory } from "../lib/apiClient.js";
import type { Message } from "../lib/conversation.js";
import type { AuraResponse, ParsedAction } from "../lib/types.js";
import { extractAction } from "../lib/extractAction.js";
import { buildSystemPrompt, TONE_INSTRUCTIONS } from "./prompts.js";
import { splitIntoBursts } from "../lib/burst.js";
import { env } from "../env.js";

export type { AuraResponse, ParsedAction };
export { extractAction, buildSystemPrompt };

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// GPT-5.4 family (May 2026). Mini for chat (instruction-tuned, drops AI-voice
// well, ~$0.0017/turn at our prompt size). Full 5.4 for hard turns. Nano for
// safety-tier classification (used by other modules).
const MODEL_CHAT = "gpt-5.4-mini";
const MODEL_HARD = "gpt-5.4";

// Inbound message contains affect keywords → escalate to gpt-5.4 for the turn.
const ESCALATION_KEYWORDS = [
  "anxious",
  "spiraling",
  "depressed",
  "alone",
  "lonely",
  "hate myself",
  "burnt out",
  "burnout",
  "panic",
  "overwhelmed",
  "can't sleep",
  "cant sleep",
  "crying",
  "hopeless",
  "exhausted",
];

function pickModel(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (ESCALATION_KEYWORDS.some((k) => lower.includes(k))) {
    return MODEL_HARD;
  }
  return MODEL_CHAT;
}

// ── Main response generation ────────────────────────────────────

/**
 * Returns the parsed reply: an array of bursts to send as separate iMessages,
 * plus any extracted action.
 */
export interface AuraBurstResponse {
  bursts: string[];
  action?: ParsedAction;
  raw: string;
}

export async function generateResponse(
  userMessage: string,
  user: ApiUser,
  contacts: ApiContact[],
  routines: ApiRoutine[],
  history: Message[],
  memories: ApiMemory[] = [],
): Promise<AuraBurstResponse> {
  const systemPrompt = buildSystemPrompt(user, contacts, routines, history, memories);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: "user", content: userMessage });

  const model = pickModel(userMessage);

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: 400,
    temperature: 0.85,
  });

  const raw = completion.choices[0]?.message?.content ?? "hmm my brain glitched\n\ntext me again";

  // Extract optional JSON action from the last line first.
  const { text, action } = extractAction(raw);

  // Split the conversational text into bursts.
  const bursts = splitIntoBursts(text);

  // Safety net: if splitting produced nothing usable, fall back to a single
  // burst with the raw text so we still send something.
  const finalBursts = bursts.length ? bursts : [text || "..."];

  return { bursts: finalBursts, action, raw };
}

// ── Daily check-in formatter (returns burst list, same contract) ─────────

export async function formatDailyCheckin(
  suggestion: DailySuggestion,
  user: ApiUser,
): Promise<string[]> {
  const contactNudges = suggestion.contactsToNudge
    .map((c) => {
      if (c.reason === "birthday_soon") return `${c.name}'s bday coming up`;
      return `${c.name} (${c.daysSinceLast}d since last)`;
    })
    .join("; ");

  const routineNudges = suggestion.routinesToNudge
    .map((r) => {
      if (r.reason === "due_today") return r.name;
      if (r.reason === "behind_weekly_target") return `${r.name} (behind this week)`;
      return `${r.name} (overdue)`;
    })
    .join("; ");

  const hasContacts = suggestion.contactsToNudge.length > 0;
  const hasRoutines = suggestion.routinesToNudge.length > 0;
  const toneGuide = TONE_INSTRUCTIONS[user.toneMode] ?? TONE_INSTRUCTIONS.neutral;
  const displayName = user.name ?? "the user";

  // No nudges → uplifting opener
  if (!hasContacts && !hasRoutines) {
    const completion = await openai.chat.completions.create({
      model: MODEL_CHAT,
      messages: [
        {
          role: "system",
          content: `You are Aura, ${displayName}'s best friend over text. Send a short, warm morning text in 2-3 bursts, separated by blank lines, one thought each (3-8 words). No bullet points. No "Good morning!". Vary the opener. ${toneGuide}`,
        },
        {
          role: "user",
          content: "morning",
        },
      ],
      max_tokens: 120,
      temperature: 0.9,
    });
    const raw = completion.choices[0]?.message?.content ?? "morning\n\nu got this today";
    return splitIntoBursts(raw);
  }

  const nudgeBlock = [
    hasContacts ? `people to reach out to: ${contactNudges}` : "",
    hasRoutines ? `habits for today: ${routineNudges}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL_CHAT,
    messages: [
      {
        role: "system",
        content: `You are Aura, ${displayName}'s best friend over text. Send a short morning text in 2-4 bursts separated by blank lines. Each burst 3-12 words, one thought. No bullets, no to-do-list framing. Weave in the data naturally and call out the most important thing first. ${toneGuide}`,
      },
      {
        role: "user",
        content: nudgeBlock,
      },
    ],
    max_tokens: 220,
    temperature: 0.85,
  });

  const raw = completion.choices[0]?.message?.content ?? `morning\n\n${contactNudges}\n\n${routineNudges}`;
  return splitIntoBursts(raw);
}
