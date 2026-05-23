// Email triage agent.
//
// Triggered by aura/signal.event with kind="mail.received". Classifies the
// email metadata into actionable / FYI / social / spam via gpt-5.4-nano.
// Only surfaces actionable items, and batches them so the user gets ONE
// digest in the morning, not a buzz per email.
//
// Pattern: write a deferred SignalEvent with kind="mail.triaged_actionable"
// when actionable. A separate cron at ~8am local sweeps all today's
// actionable triaged rows and sends a digest.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const NANO_MODEL = "gpt-5.4-nano";
const MAIN_MODEL = "gpt-5.4-mini";

const TRIAGE_PROMPT = `You are triaging an email by metadata only (no body). Classify into:
- "actionable": needs a reply, decision, or task from the user (boss, doctor, contractor, lawyer, school, bank-fraud).
- "fyi": informational (newsletters relevant to the user, receipts, confirmations).
- "social": person-to-person messages that aren't urgent.
- "spam": promotional, newsletter blast, sales pitch.

Return JSON: {"class":"actionable|fyi|social|spam","confidence":0-1,"why":"short reason"}.
Default to FYI when uncertain.`;

interface TriageResult {
  class: "actionable" | "fyi" | "social" | "spam";
  confidence: number;
  why: string;
}

export const agentEmailTriage: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-email-triage",
    triggers: [{ event: "aura/signal.event" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { userId: string; source: string; kind: string; summary: string };
    if (data.kind !== "mail.received") return { skipped: "not mail" };

    const triage = await step.run("classify", async () => {
      try {
        const completion = await openai.chat.completions.create({
          model: NANO_MODEL,
          messages: [
            { role: "system", content: TRIAGE_PROMPT },
            { role: "user", content: data.summary },
          ],
          max_completion_tokens: 100,
          temperature: 0,
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? '{"class":"fyi","confidence":0.5,"why":"parse fallback"}';
        return JSON.parse(raw) as TriageResult;
      } catch {
        return { class: "fyi", confidence: 0.3, why: "triage error" } as TriageResult;
      }
    });

    if (triage.class !== "actionable") {
      logger.info({ userId: data.userId, class: triage.class }, "email skipped");
      return { class: triage.class };
    }

    // Persist a "triaged actionable" signal for the morning digest sweep.
    await step.run("persist-actionable", () =>
      prisma.signalEvent.create({
        data: {
          userId: data.userId,
          source: data.source,
          kind: "mail.triaged_actionable",
          occurredAt: new Date(),
          summary: data.summary,
          payload: { triage } as object,
        },
      }),
    );

    return { class: "actionable", queued: true };
  },
);

/**
 * Morning sweep: gathers actionable triaged signals from the last 12 hours
 * and sends one digest per user. Runs at 8am UTC; in v2 we'll switch to
 * user-local time matching their existing checkInHour.
 */
export const agentEmailDigest: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-email-digest",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step, logger }) => {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const byUser = await step.run("group-by-user", async () => {
      const rows = await prisma.signalEvent.findMany({
        where: {
          kind: "mail.triaged_actionable",
          occurredAt: { gte: since },
          ingested: false,
        },
        orderBy: { occurredAt: "desc" },
      });
      const m = new Map<string, typeof rows>();
      for (const r of rows) {
        const list = m.get(r.userId) ?? [];
        list.push(r);
        m.set(r.userId, list);
      }
      return m;
    });

    let delivered = 0;
    for (const [userId, signals] of byUser) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, mutedUntil: true },
      });
      if (!user) continue;
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;

      interface SignalItem { id: string; summary: string }
      const top = (signals as SignalItem[]).slice(0, 5);
      const summary = top.map((s) => `- ${s.summary}`).join("\n");

      try {
        const bursts = await composeDigest(user.name ?? "this person", summary, signals.length);
        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: "email_digest" }),
        });
        if (!res.ok) {
          logger.error({ userId, status: res.status }, "digest delivery failed");
          continue;
        }
        await prisma.signalEvent.updateMany({
          where: { id: { in: top.map((s: { id: string }) => s.id) } },
          data: { ingested: true },
        });
        delivered++;
      } catch (err) {
        logger.error({ err, userId }, "digest compose error");
      }
    }

    return { delivered };
  },
);

async function composeDigest(name: string, summary: string, total: number): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MAIN_MODEL,
    messages: [
      {
        role: "user",
        content: `You are Aura, ${name}'s best friend over text.

They have ${total} emails worth their time (the others were filtered):
${summary}

Compose a 2-3 burst morning digest:
- Lowercase. Blank lines between. Each 3-12 words.
- Surface the ones most likely to need a reply.
- No "Good morning!" — vary the opener.
- No bullet points in your output.
Return only the bursts.`,
      },
    ],
    max_completion_tokens: 200,
    temperature: 0.85,
  });
  return completion.choices[0]?.message?.content ?? `u got ${total} emails worth ur time\n\ncheck them after coffee`;
}
