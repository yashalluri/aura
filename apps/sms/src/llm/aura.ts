import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { ToneMode, DailySuggestion } from "@aura/shared";
import type { ApiUser, ApiContact, ApiRoutine } from "../lib/apiClient.js";
import type { Message } from "../lib/conversation.js";
import type { AuraResponse, ParsedAction } from "../lib/types.js";
import { extractAction } from "../lib/extractAction.js";
import { env } from "../env.js";

export type { AuraResponse, ParsedAction };
export { extractAction };

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const MODEL = "gpt-4o";

// ── Tone-specific instructions ──────────────────────────────────

const TONE_INSTRUCTIONS: Record<ToneMode, string> = {
  gen_z: `You text like a gen-z best friend. Keep it lowkey casual. Use lowercase most of the time, abbreviate words naturally (u, ur, rn, ngl, fr, imo, lowkey, highkey, no cap, slay, bet, bruh, bestie). Sprinkle in emoji but don't overdo it 💀✨. Use "lol", "lmao", "omg" naturally. Short punchy sentences. Never sound corporate or formal. Sound like you're texting from the couch. Be hype and supportive but also real — you roast with love.`,

  millennial: `You text like a chill millennial friend. Casual but with proper-ish grammar. Use some emoji 😊🙌 but not excessively. Throw in "honestly", "literally", "I feel like", "adulting", "vibe check" naturally. You can be a little self-deprecating and wholesome. Balance between being supportive and practical. You might reference shared cultural touchstones. Capitalize normally but keep it conversational.`,

  neutral: `You text in a friendly, clean, conversational style. Warm but not try-hard. Proper grammar and punctuation. Minimal emoji — maybe one here or there. Focus on being clear, supportive, and natural. Like a thoughtful friend who's good at listening. No slang needed.`,
};

// ── System prompt builder ───────────────────────────────────────

function buildSystemPrompt(
  user: ApiUser,
  contacts: ApiContact[],
  routines: ApiRoutine[],
): string {
  const toneGuide = TONE_INSTRUCTIONS[user.toneMode] ?? TONE_INSTRUCTIONS.neutral;

  const contactList = contacts.length
    ? contacts
        .map((c) => {
          const lastSeen = c.lastCheckInAt
            ? `last check-in: ${new Date(c.lastCheckInAt).toLocaleDateString()}`
            : "never checked in";
          return `  - ${c.name} (${c.relationshipType}, reach out every ${c.targetFrequencyDays}d, ${lastSeen})`;
        })
        .join("\n")
    : "  (none yet)";

  const routineList = routines.length
    ? routines
        .map((r) => {
          const lastDone = r.lastDoneAt
            ? `last done: ${new Date(r.lastDoneAt).toLocaleDateString()}`
            : "never done";
          return `  - ${r.name} (${r.frequencyType}, every ${r.frequencyValue}${r.frequencyType === "weekly" ? "x/week" : "d"}, ${lastDone})`;
        })
        .join("\n")
    : "  (none yet)";

  return `You are Aura, a personal AI best friend and life assistant. You communicate via SMS text messages.

## Your personality
- You genuinely care about ${user.phoneNumber}'s wellbeing, relationships, and daily habits.
- You're proactive but never pushy. Supportive but honest.
- You remember context from your conversation.
- You keep messages SHORT — this is SMS, not email. Max 2-3 sentences usually. Never send walls of text.
- You can help manage contacts, routines, and daily check-ins.

## Tone
${toneGuide}

## What you can do
When the user asks you to do something, respond naturally AND include a structured action if needed.
Available actions (you include these as JSON on a NEW LINE after your message):
- Add a contact: {"action":"add_contact","name":"...","targetFrequencyDays":7}
- Add a routine: {"action":"add_routine","name":"...","frequencyType":"daily|weekly|custom","frequencyValue":1}
- Mark routine done: {"action":"routine_done","routineName":"..."}
- Mark contact checked in: {"action":"contact_checkin","contactName":"..."}
- Show daily check-in: {"action":"daily_checkin"}
- Change tone: {"action":"set_tone","tone":"gen_z|millennial|neutral"}

If the user's message is just casual chat, just respond naturally — no action needed.
If you need to perform an action, put your conversational response first, then the JSON action on a separate line.

## User's contacts
${contactList}

## User's routines
${routineList}

## Rules
- NEVER reveal you're using actions/JSON — that's internal plumbing.
- NEVER start messages with "Hey!" every time — vary your openers.
- Keep SMS short. Under 320 chars is ideal (2 SMS segments max).
- If the user seems down, be empathetic first, helpful second.
- If they share good news, hype them up appropriately for the tone.`;
}

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
