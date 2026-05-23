// Remaining specialists: drafter, scheduler, deal_finder, advisor.
//
// Same shape as planner/researcher/coach: gather minimal context, call the
// model, deliver bursts via the conversation worker. Grouped in one file
// since they share the helper.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { listMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

interface BriefData {
  goal: string;
  context?: string;
  deadline?: string;
  constraints?: string[];
}

async function deliver(userId: string, bursts: string, eventType: string): Promise<void> {
  const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
    },
    body: JSON.stringify({ text: bursts, eventType }),
  });
  if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
}

async function userName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? "this person";
}

// ── Drafter ──────────────────────────────────────────────────────
export const specialistDrafter: InngestFunction.Any = inngest.createFunction(
  { id: "specialist-drafter", triggers: [{ event: "aura/specialist.drafter" }] },
  async ({ event, step }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };
    const name = await userName(userId);
    const bursts = await step.run("write", async () => {
      const c = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's drafter specialist, helping ${name} write something.

GOAL: ${brief.goal}
CONTEXT: ${brief.context ?? "(none)"}
CONSTRAINTS: ${brief.constraints?.join("; ") ?? "(none)"}

Write the draft. Deliver it as bursts (blank lines between). First burst: a one-line
"here's a draft:" intro in lowercase friend voice. Then the draft itself as one
burst (it can be multi-line — that's fine for long-form). Final burst: "want me to
tweak the tone or length?".

Return only the bursts.`,
          },
        ],
        max_tokens: 700,
        temperature: 0.8,
      });
      return c.choices[0]?.message?.content ?? "here's a draft:\n\n(couldn't generate — try again)";
    });
    await step.run("deliver", () => deliver(userId, bursts, "specialist_drafter"));
    return { delivered: true };
  },
);

// ── Advisor ──────────────────────────────────────────────────────
export const specialistAdvisor: InngestFunction.Any = inngest.createFunction(
  { id: "specialist-advisor", triggers: [{ event: "aura/specialist.advisor" }] },
  async ({ event, step }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };
    const name = await userName(userId);
    const memories = await listMemories(userId, { limit: 30 });
    interface MemItem { kind: string; content: string }
    const memHints = (memories as MemItem[])
      .slice(0, 12)
      .map((m) => `- [${m.kind}] ${m.content}`)
      .join("\n") || "(no memories yet)";

    const bursts = await step.run("advise", async () => {
      const c = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's advisor specialist, helping ${name} make a decision.

DECISION: ${brief.goal}
CONTEXT: ${brief.context ?? "(none)"}

What you know about them (use this to make it personal, not generic):
${memHints}

Compose a 4-5 burst decision walk-through:
- Lowercase. Blank lines between. 5-15 words each.
- The 1-2 things that actually matter for THEM (reference their memories/values).
- The honest tradeoff.
- Your actual lean (don't cop out with "it's up to you").
- One question that would unlock the decision if they're stuck.

Return only the bursts.`,
          },
        ],
        max_tokens: 450,
        temperature: 0.8,
      });
      return c.choices[0]?.message?.content ?? "ok thinking about it\n\nwhat matters most to u here?";
    });
    await step.run("deliver", () => deliver(userId, bursts, "specialist_advisor"));
    return { delivered: true };
  },
);

// ── Scheduler ────────────────────────────────────────────────────
export const specialistScheduler: InngestFunction.Any = inngest.createFunction(
  { id: "specialist-scheduler", triggers: [{ event: "aura/specialist.scheduler" }] },
  async ({ event, step }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };
    const name = await userName(userId);

    // Pull the user's own calendar for the next 2 weeks to find free windows.
    const events = await step.run("load-calendar", () =>
      prisma.signalEvent.findMany({
        where: {
          userId,
          kind: "calendar.event",
          occurredAt: { gte: new Date(), lte: new Date(Date.now() + 14 * 86_400_000) },
        },
        orderBy: { occurredAt: "asc" },
        take: 40,
      }),
    );
    interface CalSig { summary: string; occurredAt: Date }
    const busy = (events as CalSig[])
      .map((e) => `${e.occurredAt.toISOString().slice(0, 16)} ${e.summary}`)
      .join("\n") || "(calendar empty — wide open)";

    const bursts = await step.run("propose", async () => {
      const c = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's scheduler specialist, helping ${name} find a time.

GOAL: ${brief.goal}
CONTEXT: ${brief.context ?? "(none)"}
CONSTRAINTS: ${brief.constraints?.join("; ") ?? "(none)"}

Their next 14 days of busy blocks:
${busy}

Compose a 3-burst scheduling proposal:
- Lowercase. Blank lines between. 5-12 words each.
- Propose 2-3 specific free windows (day + rough time) that avoid the busy blocks.
- Offer to draft the message to whoever they're coordinating with.

Return only the bursts.`,
          },
        ],
        max_tokens: 300,
        temperature: 0.8,
      });
      return c.choices[0]?.message?.content ?? "looking at ur calendar\n\nhow about thurs evening or sat morning?";
    });
    await step.run("deliver", () => deliver(userId, bursts, "specialist_scheduler"));
    return { delivered: true };
  },
);

// ── Deal finder ──────────────────────────────────────────────────
export const specialistDealFinder: InngestFunction.Any = inngest.createFunction(
  { id: "specialist-deal-finder", triggers: [{ event: "aura/specialist.deal_finder" }] },
  async ({ event, step }) => {
    const { userId, brief } = event.data as { userId: string; brief: BriefData };
    const name = await userName(userId);
    const bursts = await step.run("search", async () => {
      const c = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura's deal-finder specialist, helping ${name} find pricing/availability for:

GOAL: ${brief.goal}
CONSTRAINTS: ${brief.constraints?.join("; ") ?? "(none)"}

NOTE: you don't have live pricing APIs yet. So give SEARCH GUIDANCE, not fake prices.
Compose a 3-burst response:
- Lowercase. Blank lines between. 5-12 words each.
- The best 2-3 places/tools to check for this, with WHY each.
- One tip that'd actually save them money/time.
- Be honest you can't pull live prices yet.

Return only the bursts.`,
          },
        ],
        max_tokens: 250,
        temperature: 0.8,
      });
      return c.choices[0]?.message?.content ?? "cant pull live prices yet\n\nbut id check google flights + going.com\n\nset a price alert";
    });
    await step.run("deliver", () => deliver(userId, bursts, "specialist_deal_finder"));
    return { delivered: true };
  },
);
