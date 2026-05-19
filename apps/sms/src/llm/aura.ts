import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { DailySuggestion } from "@aura/shared";
import type { ApiUser, ApiContact, ApiRoutine } from "../lib/apiClient.js";
import type { Message } from "../lib/conversation.js";
import type { AuraResponse, ParsedAction } from "../lib/types.js";
import { extractAction } from "../lib/extractAction.js";
import { buildSystemPrompt, TONE_INSTRUCTIONS } from "./prompts.js";
import { env } from "../env.js";

export type { AuraResponse, ParsedAction };
export { extractAction, buildSystemPrompt };

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const MODEL = "gpt-4o";

// ── Main response generation ────────────────────────────────────

export async function generateResponse(
  userMessage: string,
  user: ApiUser,
  contacts: ApiContact[],
  routines: ApiRoutine[],
  history: Message[],
): Promise<AuraResponse> {
  const systemPrompt = buildSystemPrompt(user, contacts, routines);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current message
  messages.push({ role: "user", content: userMessage });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 300,
    temperature: 0.85,
  });

  const raw = completion.choices[0]?.message?.content ?? "hmm, my brain glitched. try again?";
  return extractAction(raw);
}

// ── Daily check-in formatter ────────────────────────────────────

export async function formatDailyCheckin(
  suggestion: DailySuggestion,
  user: ApiUser,
): Promise<string> {
  const contactNudges = suggestion.contactsToNudge
    .map((c) => {
      if (c.reason === "birthday_soon") return `🎂 ${c.name}'s birthday is coming up!`;
      return `${c.name} (${c.daysSinceLast}d since last check-in)`;
    })
    .join("\n");

  const routineNudges = suggestion.routinesToNudge
    .map((r) => {
      if (r.reason === "due_today") return `${r.name}`;
      if (r.reason === "behind_weekly_target") return `${r.name} (behind this week)`;
      return `${r.name} (overdue)`;
    })
    .join("\n");

  const hasContacts = suggestion.contactsToNudge.length > 0;
  const hasRoutines = suggestion.routinesToNudge.length > 0;

  if (!hasContacts && !hasRoutines) {
    // Nothing to nudge — send an encouraging message
    const toneGuide = TONE_INSTRUCTIONS[user.toneMode] ?? TONE_INSTRUCTIONS.neutral;
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are Aura, a personal AI best friend. Send a short, uplifting good morning text. ${toneGuide} Keep it under 160 chars. No hashtags.`,
        },
        {
          role: "user",
          content: "Send me a good morning message. I'm all caught up on my contacts and routines!",
        },
      ],
      max_tokens: 100,
      temperature: 0.9,
    });
    return completion.choices[0]?.message?.content ?? "Good morning! You're on top of everything today ✨";
  }

  // Build a prompt for the LLM to turn structured data into a natural message
  const toneGuide = TONE_INSTRUCTIONS[user.toneMode] ?? TONE_INSTRUCTIONS.neutral;
  const prompt = `Turn this daily check-in data into a short, natural morning text message.

${hasContacts ? `People to reach out to:\n${contactNudges}` : ""}
${hasRoutines ? `Routines/habits for today:\n${routineNudges}` : ""}

Rules:
- Keep it under 300 chars
- ${toneGuide}
- Make it feel personal, not like a to-do list
- Don't use bullet points — weave it into natural text
- Start with a greeting variation (not always "Good morning!")`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `You are Aura, a personal AI best friend. ${toneGuide}` },
      { role: "user", content: prompt },
    ],
    max_tokens: 200,
    temperature: 0.85,
  });

  return completion.choices[0]?.message?.content ?? `Good morning! Here's your daily check-in:\n${contactNudges}\n${routineNudges}`;
}
