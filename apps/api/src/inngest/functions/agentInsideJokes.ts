// Inside-joke amplifier.
//
// Triggered by memory.extract. When a new memory is written, check if it
// looks like an inside-joke setup (callback word, group reference, recurring
// reaction). If so, tag it explicitly so the conversation prompt surfaces it
// when relevant.
//
// We tag by writing a second memory with kind=pattern AND source="inside_joke"
// — the conversation worker's existing memory retrieval will find it because
// it scores all kinds. This lets Aura land inside jokes naturally.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { writeMemory } from "../../services/memory.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const NANO = "gpt-5.4-nano";

const DETECT_PROMPT = `You are scanning a fresh memory about a user. Determine if it contains an "inside joke" — a phrase, nickname, recurring reference, or shared bit between this user and someone they know, that's used playfully and would be funny to call back later.

Examples of inside-joke memories:
- "User and Maya always say 'cereal o'clock' when one of them eats dinner cereal."
- "User calls their coworker James 'Slow Text James' because he takes 6 hours to reply."
- "User and Sara always joke about the Tahoe sunburn incident."

Examples that are NOT inside jokes:
- "User has a sister Maya."
- "User likes iced coffee."
- "User is going to the gym Mondays."

Return JSON: {"is_inside_joke": bool, "callback_phrase": "short tag for retrieval, or null"}.`;

export const agentInsideJokes: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-inside-jokes",
    triggers: [{ event: "aura/memory.extract" }],
  },
  async ({ event, step, logger }) => {
    const { userId, messageId } = event.data as { userId: string; messageId: string };

    // Grab the memories just produced for this messageId (their `source`
    // field encodes the originating message).
    const fresh = await step.run("load-fresh", () =>
      prisma.memory.findMany({
        where: {
          userId,
          source: `conversation:${messageId}`,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      }),
    );

    if (!fresh.length) return { skipped: "no fresh memories" };

    const { listMemories } = await import("../../services/memory.js");
    const decrypted = await listMemories(userId, { limit: 200 });
    interface FreshRow { id: string }
    const freshIds = new Set((fresh as FreshRow[]).map((f) => f.id));
    const matched = decrypted.filter((m) => freshIds.has(m.id));

    let tagged = 0;
    for (const m of matched) {
      try {
        const completion = await openai.chat.completions.create({
          model: NANO,
          messages: [
            { role: "system", content: DETECT_PROMPT },
            { role: "user", content: m.content },
          ],
          max_tokens: 80,
          temperature: 0,
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { is_inside_joke?: boolean; callback_phrase?: string };
        if (!parsed.is_inside_joke || !parsed.callback_phrase) continue;

        await writeMemory({
          userId,
          kind: "pattern",
          content: `inside-joke: "${parsed.callback_phrase}" — from: ${m.content}`,
          source: "agent:inside_jokes",
          importance: 0.7,
          attrs: { source_memory_id: m.id, callback_phrase: parsed.callback_phrase },
        });
        tagged++;
      } catch (err) {
        logger.warn({ err, memoryId: m.id }, "inside-joke detect failed");
      }
    }

    return { scanned: matched.length, tagged };
  },
);
