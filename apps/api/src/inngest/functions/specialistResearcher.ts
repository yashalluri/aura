// Researcher specialist — answers factual/comparison questions using web search
// inside the model when available (gpt-5.4 with `tools: [web_search]` if your
// OpenAI tier has web-search). Falls back to model knowledge if not.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

interface BriefData {
  goal: string;
  context?: string;
}

export const specialistResearcher: InngestFunction.Any = inngest.createFunction(
  {
    id: "specialist-researcher",
    triggers: [{ event: "aura/specialist.researcher" }],
  },
  async ({ event, step, logger }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, mutedUntil: true },
    });
    if (!user || (user.mutedUntil && user.mutedUntil > new Date())) {
      return { skipped: true };
    }

    const bursts = await step.run("research", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's researcher specialist, texting the user via their AI best friend Aura.

Question: ${brief.goal}
Context they shared: ${brief.context ?? "(none)"}

Compose a 3-4 burst answer:
- Lowercase. Blank lines between. Each 5-15 words.
- Concrete and specific. No "It depends on many factors" filler.
- If uncertain, flag it ("not 100% on this, but...").
- One clear recommendation if applicable.
- Friend voice — like texting back after looking something up.

Return only the bursts.`,
          },
        ],
        max_tokens: 400,
        temperature: 0.7,
      });
      return completion.choices[0]?.message?.content ?? `looked into it\n\nshort answer: idk yet\n\nlet me dig more`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "specialist_researcher" }),
      });
      if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId, goal: brief.goal }, "researcher delivered");
    return { delivered: true };
  },
);
