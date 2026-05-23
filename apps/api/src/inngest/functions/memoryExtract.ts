// Memory extraction job.
//
// Triggered after each user-role Message insert. Runs gpt-5.4-mini against the
// last 6 turns and produces 0-3 structured memory candidates. Each candidate
// is written via writeMemory() which dedups against existing semantically-near
// memories.
//
// Async by design — the user's reply is not blocked on extraction.

import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { writeMemory } from "../../services/memory.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const MODEL = "gpt-5.4-mini";

const EXTRACTION_SYSTEM_PROMPT = `You extract long-term memories from a conversation between a user and their AI best friend "Aura".

Return a JSON object with a "memories" array of 0-3 entries. Only extract things worth remembering for weeks/months. Skip small-talk, weather, transient feelings.

Each memory has:
- kind: "fact" | "preference" | "event" | "relationship" | "goal" | "value" | "pattern"
- content: a single short factual sentence in third person (e.g., "User has a sister named Maya in Brooklyn", "User prefers iced coffee over hot", "User is training for a half marathon in October")
- importance: 0-1 (how much this matters to remember)
- confidence: 0-1 (how confident you are this is true)

DO NOT extract:
- Anything Aura said (only user-stated facts)
- Speculation
- Greetings, small talk, emoji reactions
- Stuff already covered by routines/contacts (which are stored separately)

Return: {"memories": [...]}. If nothing worth extracting, return {"memories": []}.`;

interface ExtractedMemory {
  kind: string;
  content: string;
  importance?: number;
  confidence?: number;
}

const VALID_KINDS = new Set([
  "fact",
  "preference",
  "event",
  "relationship",
  "goal",
  "value",
  "pattern",
]);

import type { InngestFunction } from "inngest";

export const memoryExtract: InngestFunction.Any = inngest.createFunction(
  {
    id: "memory-extract",
    triggers: [{ event: "aura/memory.extract" }],
  },
  async ({ event, step, logger }) => {
    const { userId, messageId } = event.data as { userId: string; messageId: string };

    // Pull the last 6 turns ending with the trigger message
    const window = await step.run("load-window", async () => {
      const trigger = await prisma.message.findUnique({ where: { id: messageId } });
      if (!trigger) return null;
      const rows = await prisma.message.findMany({
        where: { userId, createdAt: { lte: trigger.createdAt } },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      return rows.reverse();
    });

    if (!window || window.length < 2) {
      logger.info({ userId, messageId, count: window?.length ?? 0 }, "skip extract: too few turns");
      return { extracted: 0 };
    }

    const transcript = window
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    const extracted = await step.run("call-llm", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
        max_tokens: 500,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? '{"memories":[]}';
      try {
        const parsed = JSON.parse(raw) as { memories?: ExtractedMemory[] };
        return parsed.memories ?? [];
      } catch (err) {
        logger.error({ err, raw }, "extraction JSON parse failed");
        return [];
      }
    });

    if (!extracted.length) {
      return { extracted: 0 };
    }

    const writes = await step.run("write-memories", async () => {
      const results = await Promise.all(
        extracted.map(async (m: ExtractedMemory) => {
          if (!VALID_KINDS.has(m.kind)) {
            logger.warn({ kind: m.kind }, "invalid memory kind, skipping");
            return null;
          }
          if (!m.content || m.content.length > 2000) return null;
          return writeMemory({
            userId,
            kind: m.kind as Parameters<typeof writeMemory>[0]["kind"],
            content: m.content,
            source: `conversation:${messageId}`,
            importance: clamp01(m.importance ?? 0.5),
            confidence: clamp01(m.confidence ?? 0.7),
          });
        }),
      );
      return results.filter(Boolean).length;
    });

    return { extracted: writes };
  },
);

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
