import OpenAI from "openai";
import type { ParsedAction } from "./types.js";
import type { ApiContact, ApiRoutine } from "./apiClient.js";
import { fuzzyMatch } from "./fuzzyMatch.js";
import * as api from "./apiClient.js";
import { env } from "../env.js";

export { fuzzyMatch };

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL_DRAFT = "gpt-5.4-mini";

/**
 * Execute a parsed action from the LLM response against the API.
 * Returns a user-facing burst list (or null if the LLM's text is the reply).
 */
export async function executeAction(
  action: ParsedAction,
  userId: string,
  contacts: ApiContact[],
  routines: ApiRoutine[],
): Promise<string[] | null> {
  switch (action.action) {
    case "add_contact": {
      await api.createContact(userId, {
        name: action.name,
        targetFrequencyDays: action.targetFrequencyDays,
      });
      return null;
    }

    case "add_routine": {
      await api.createRoutine(userId, {
        name: action.name,
        frequencyType: action.frequencyType,
        frequencyValue: action.frequencyValue,
      });
      return null;
    }

    case "routine_done": {
      const match = fuzzyMatch(action.routineName, routines.map((r) => ({ id: r.id, name: r.name })));
      if (!match) return [`hmm couldn't find a routine called "${action.routineName}"`, "check ur list?"];
      await api.recordRoutineDone(match.id);
      return null;
    }

    case "contact_checkin": {
      const match = fuzzyMatch(action.contactName, contacts.map((c) => ({ id: c.id, name: c.name })));
      if (!match) return [`couldn't find a contact called "${action.contactName}"`, "want me to add them?"];
      await api.recordContactCheckin(match.id);
      return null;
    }

    case "daily_checkin": {
      const { suggestion } = await api.getDailyCheckin(userId);
      const { formatDailyCheckin } = await import("../llm/aura.js");
      const user = await api.getUser(userId);
      return formatDailyCheckin(suggestion, user);
    }

    case "set_tone": {
      await api.updateUser(userId, { toneMode: action.tone });
      return null;
    }

    case "set_name": {
      await api.updateUser(userId, { name: action.name });
      return null;
    }

    case "set_timezone": {
      await api.updateUser(userId, { timezone: action.timezone });
      return null;
    }

    // ── Sprint 7: agent capabilities ──────────────────────────────

    case "remember_fact": {
      await api.writeMemory(userId, {
        kind: action.kind,
        content: action.content,
        source: "conversation:manual",
        importance: action.importance ?? 0.6,
      });
      return null;
    }

    case "recall": {
      const results = await api.retrieveMemories(userId, action.query, 5);
      if (!results.length) {
        return ["nothing comes up for that", "tell me again and i'll remember"];
      }
      const bursts = results.slice(0, 3).map((r) => `- ${r.content}`);
      return ["here's what i got:", ...bursts];
    }

    case "draft_text_to_contact": {
      const match = fuzzyMatch(action.contactName, contacts.map((c) => ({ id: c.id, name: c.name })));
      if (!match) {
        return [`couldn't find ${action.contactName}`, "want me to add them first?"];
      }
      // Pull memories about this contact for context.
      const memories = await api.retrieveMemories(userId, action.contactName, 5).catch(() => []);
      const contextLines = memories.map((m) => `- ${m.content}`).join("\n");

      const draft = await draftMessage({
        contactName: match.name,
        intent: action.intent,
        context: contextLines,
      });
      // Return the draft to the user; they can copy/paste or say "send it".
      return [
        `draft to ${match.name}:`,
        draft,
        `say "send it" if u want me to actually send (not wired yet — copy for now)`,
      ];
    }

    case "schedule_nudge": {
      const when = new Date(action.when);
      if (Number.isNaN(when.getTime())) {
        return ["that date didn't parse", "try again with something like 'tomorrow at 7pm'"];
      }
      await api.scheduleNudge(userId, {
        when: when.toISOString(),
        kind: action.kind,
        payload: action.payload,
      });
      return null;
    }

    case "set_goal": {
      await api.createGoal(userId, {
        kind: action.kind,
        title: action.title,
        why: action.why,
        deadline: action.deadline,
        milestones: action.milestones,
      });
      return null;
    }

    case "progress_goal": {
      // Status update only — milestone completion is a separate API call.
      await api.updateGoalStatus(userId, action.goalId, "active");
      return null;
    }

    case "summarize_relationship": {
      const match = fuzzyMatch(action.contactName, contacts.map((c) => ({ id: c.id, name: c.name })));
      const targetName = match?.name ?? action.contactName;
      const memories = await api.retrieveMemories(userId, targetName, 8).catch(() => []);
      if (!memories.length) {
        return [`nothing saved about ${targetName} yet`, "tell me what's up with them"];
      }
      const top = memories.slice(0, 4).map((m) => `- ${m.content}`);
      return [`what i know about ${targetName}:`, ...top];
    }

    case "draft_hard_conversation": {
      const flavors = action.flavors?.length ? action.flavors : ["direct", "soft", "deadpan"];
      const drafts = await draftHardConversation({
        situation: action.situation,
        flavors,
      });
      const bursts: string[] = [
        `here are ${drafts.length} versions for: ${action.situation}`,
      ];
      for (const d of drafts) {
        bursts.push(`${d.flavor.toUpperCase()}:\n\n${d.text}`);
      }
      bursts.push("which one feels closest?");
      return bursts;
    }

    case "vibe_check": {
      const reading = await runVibeCheck({
        conversation: action.conversation,
        perspective: action.perspective ?? "user",
      });
      return [reading];
    }

    case "draft_dating_reply": {
      const flavors = action.flavors?.length ? action.flavors : ["chill", "witty", "earnest"];
      const drafts = await draftDatingReplies({
        received: action.received,
        intent: action.intent,
        flavors,
      });
      const bursts: string[] = [`${drafts.length} replies to choose from:`];
      for (const d of drafts) {
        bursts.push(`${d.flavor.toUpperCase()}:\n\n${d.text}`);
      }
      return bursts;
    }

    case "spawn_agent": {
      try {
        const result = await api.dispatchSpecialist(userId, {
          kind: action.kind,
          brief: action.brief,
        });
        // Tell the user the specialist is working. The real reply arrives
        // async from the specialist Inngest function via /internal/send.
        const seconds = Math.max(2, Math.round(result.estimateMs / 1000));
        return [`ok let me think on this`, `give me like ${seconds}s`];
      } catch (err) {
        return [`hmm my brain hiccuped on that one`, `try asking again?`];
      }
    }

    case "errand": {
      // v1 ships errand recognition and drafts a "what i'd do" plan. Actual
      // booking (Booksy, Instacart, Lyft) lives behind Composio connectors
      // shipped in a later sprint — for now we surface the structured plan
      // so the user can act on it.
      const completion = await openai.chat.completions.create({
        model: MODEL_DRAFT,
        messages: [
          {
            role: "user",
            content: `You are Aura, the user's best friend over text. They asked you to handle an errand.

Errand kind: ${action.kind}
Details: ${action.details}

Compose a 3-burst response:
- Burst 1: confirm what you understood + the most likely venue/service they'd use
- Burst 2: what they need to confirm (time? specific provider?)
- Burst 3: "want me to draft the request?" or "just say go"

Rules: lowercase, blank lines between, 3-12 words each. No bullets.

Return only the bursts.`,
          },
        ],
        max_completion_tokens: 200,
        temperature: 0.85,
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        return [`got it — ${action.kind} — ${action.details}`, "what time works?"];
      }
      return raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    }

    default:
      return null;
  }
}

async function runVibeCheck(args: {
  conversation: string;
  perspective: "user" | "other";
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL_DRAFT,
    messages: [
      {
        role: "user",
        content: `You are Aura, the user's best friend over text. They pasted a dating-app conversation and want an honest read.

Conversation (perspective: ${args.perspective}):
${args.conversation}

Give a 3-burst vibe check, blank lines between bursts:
- Burst 1: the overall read (interested / lukewarm / red flag / etc.)
- Burst 2: the most telling specific signal (one quoted line or pattern)
- Burst 3: what you'd recommend the user actually do

Rules:
- Lowercase. Friend voice. Honest, not validating.
- No "I'm sorry but..." softening when something's actually concerning.
- No therapist-voice. No bullet points.

Return the bursts separated by blank lines.`,
      },
    ],
    max_completion_tokens: 280,
    temperature: 0.8,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "couldnt read it\n\ntry pasting again";
}

interface DatingDraft {
  flavor: string;
  text: string;
}

async function draftDatingReplies(args: {
  received: string;
  intent: string;
  flavors: string[];
}): Promise<DatingDraft[]> {
  const completion = await openai.chat.completions.create({
    model: MODEL_DRAFT,
    messages: [
      {
        role: "user",
        content: `The user got this message on a dating app and wants to reply:

"${args.received}"

What they want to convey: ${args.intent}

Draft ${args.flavors.length} replies, one per flavor:
${args.flavors.map((f) => "- " + f).join("\n")}

Flavor meanings:
- flirty: playful, leaning in, low-stakes innuendo OK if it fits
- chill: brief, easygoing, no over-effort
- witty: a little clever, callback or observation
- earnest: warm, direct, no performance

Rules per draft:
- 1-2 sentences max. Real-person texting cadence.
- Lowercase OK. No "Hey [name]!" — most people don't open that way.
- Don't echo the original verbatim. Move the conversation.
- No emoji unless the flavor genuinely calls for one (most don't).

Return JSON: {"drafts":[{"flavor":"...","text":"..."},...]}.`,
      },
    ],
    max_completion_tokens: 350,
    temperature: 0.85,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? '{"drafts":[]}';
  try {
    const parsed = JSON.parse(raw) as { drafts: DatingDraft[] };
    return parsed.drafts ?? [];
  } catch {
    return [{ flavor: "fallback", text: "(couldn't generate — try rephrasing intent)" }];
  }
}

interface HardConversationDraft {
  flavor: string;
  text: string;
}

async function draftHardConversation(args: {
  situation: string;
  flavors: string[];
}): Promise<HardConversationDraft[]> {
  const completion = await openai.chat.completions.create({
    model: MODEL_DRAFT,
    messages: [
      {
        role: "user",
        content: `You are Aura, the user's best friend over text. They need to send a hard message about:

"${args.situation}"

Draft ${args.flavors.length} variants, one per flavor below. Each is the actual message the USER would send to the other person — not Aura speaking.

Flavors:
${args.flavors.map((f) => "- " + f).join("\n")}

Flavor meanings:
- direct: clear, no apology padding, no fluff.
- soft: warm, acknowledges feelings, leaves room.
- deadpan: dry, minimal words, slightly self-aware.
- vulnerable: honest about own feelings, no posturing.

Rules per draft:
- 1-3 sentences max. Texts, not emails.
- No "Hey [name]!" opening. Most real texts don't start that way.
- No AI tells ("I hope this finds you well", "I just wanted to reach out").
- Lowercase OK if it matches the flavor.

Return JSON: {"drafts":[{"flavor":"direct","text":"..."},{"flavor":"soft","text":"..."}]}.`,
      },
    ],
    max_completion_tokens: 500,
    temperature: 0.85,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? '{"drafts":[]}';
  try {
    const parsed = JSON.parse(raw) as { drafts: HardConversationDraft[] };
    return parsed.drafts ?? [];
  } catch {
    return [{ flavor: "fallback", text: "(couldn't generate — try rephrasing)" }];
  }
}

async function draftMessage(args: {
  contactName: string;
  intent: string;
  context: string;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL_DRAFT,
    messages: [
      {
        role: "user",
        content: `Draft an iMessage from the user to their contact ${args.contactName}.

Intent: ${args.intent}

Context (what we remember about ${args.contactName}):
${args.context || "(no specific context — keep it simple)"}

Rules:
- 1-3 short lines max. Sounds like a real person typed it.
- Lowercase, casual, no AI tells.
- Match the intent precisely. Don't add fluff.
- No "Hey [name]!" — most people don't start texts that way.

Return ONLY the draft text, no preamble.`,
      },
    ],
    max_completion_tokens: 150,
    temperature: 0.85,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "hey";
}
