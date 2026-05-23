// Money pulse agent.
//
// Weekly Sun 6pm UTC. Looks at last 30 days of money.transaction signals.
// Finds:
//   - Recurring subscription charges (same merchant + similar amount on a
//     monthly cadence) → flag for sub audit.
//   - Categories that ballooned vs prior month → "u spent $500 on coffee".
//   - Big single charges → "u dropped $1200 at hotel — trip i don't know
//     about?".
// Drafts a friend-voiced summary in 2-4 bursts.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

interface MoneyPayload {
  merchant: string;
  amount: number;
  currency: string;
  category: string[];
  channel: string;
  transaction_id?: string;
}

interface SigRow {
  occurredAt: Date;
  payload: MoneyPayload;
}

export const agentMoneyPulse: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-money-pulse",
    triggers: [{ cron: "0 18 * * 0" }], // Sunday 6pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("eligible", () =>
      prisma.user.findMany({
        where: {
          integrations: { some: { app: "plaid", status: "active" } },
        },
        select: { id: true, mutedUntil: true, name: true },
      }),
    );

    let sent = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      try {
        await processUser(user.id, user.name ?? "this person");
        sent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, "money pulse failed");
      }
    }
    return { sent };
  },
);

async function processUser(userId: string, name: string): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const sigs = (await prisma.signalEvent.findMany({
    where: {
      userId,
      source: "plaid",
      kind: "money.transaction",
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "asc" },
  })) as unknown as SigRow[];
  if (sigs.length < 3) return;

  const txns = sigs.map((s) => s.payload);

  // 1. Recurring subscription candidates: same merchant repeated ≥2 times
  //    with each amount within 10% of the median for that merchant.
  const byMerchant = new Map<string, MoneyPayload[]>();
  for (const t of txns) {
    if (t.amount <= 0) continue; // skip refunds/income
    const m = t.merchant;
    const list = byMerchant.get(m) ?? [];
    list.push(t);
    byMerchant.set(m, list);
  }
  const subscriptions: Array<{ merchant: string; amount: number; count: number }> = [];
  for (const [merchant, list] of byMerchant) {
    if (list.length < 2) continue;
    const amounts = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)]!;
    const allClose = amounts.every((a) => Math.abs(a - median) / median < 0.1);
    if (allClose) {
      subscriptions.push({ merchant, amount: median, count: list.length });
    }
  }

  // 2. Big charges: top 3 single transactions by absolute amount.
  const bigCharges = [...txns]
    .filter((t) => t.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // 3. Category totals.
  const catTotals = new Map<string, number>();
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const cat = t.category?.[0] ?? "other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + t.amount);
  }
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Compose context for the LLM.
  const subsLine = subscriptions.length
    ? subscriptions.map((s) => `${s.merchant} ($${s.amount.toFixed(2)} ×${s.count})`).join(", ")
    : "(none detected)";
  const bigLine = bigCharges.map((t) => `$${t.amount.toFixed(2)} at ${t.merchant}`).join("; ");
  const catLine = topCats.map(([c, total]) => `${c} $${total.toFixed(0)}`).join(", ");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are Aura, ${name}'s best friend over text.

Past 30 days of spending — pulse summary:
- Recurring/subscriptions: ${subsLine}
- Biggest single charges: ${bigLine}
- Top categories: ${catLine}

Compose a 3-burst money pulse:
- Lowercase. Blank lines between. Each 3-12 words.
- Surface the most-interesting ONE thing (a stale-feeling sub, a wild category, a big out-of-character charge).
- One friendly suggestion or question. Not a lecture.
- No bullets, no preamble, no "Here's your weekly summary".

Return only the bursts.`,
      },
    ],
    max_tokens: 220,
    temperature: 0.85,
  });
  const bursts = completion.choices[0]?.message?.content;
  if (!bursts) return;

  await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
    },
    body: JSON.stringify({ text: bursts, eventType: "money_pulse" }),
  });
}
