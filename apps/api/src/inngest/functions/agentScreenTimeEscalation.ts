// Screen-time escalation agent.
//
// Triggered by aura/signal.event with kind=screentime.session. Watches for
// sessions on user-configured apps that exceed thresholds (default: 20 min
// on Instagram/TikTok/X). Sends an escalating message in friend voice.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

const DEFAULT_THRESHOLDS_MIN: Record<string, number[]> = {
  Instagram: [20, 30, 45],
  TikTok: [20, 30, 45],
  X: [15, 25, 40],
  Twitter: [15, 25, 40],
};

export const agentScreenTimeEscalation: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-screen-time-escalation",
    triggers: [{ event: "aura/signal.event" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { userId: string; source: string; kind: string; occurredAt: string; summary: string };
    if (data.kind !== "screentime.session") {
      return { skipped: "not a screentime event" };
    }

    // Parse out the duration from the summary ("Instagram for 22min").
    const match = data.summary.match(/^(\S.*?)\s+for\s+(\d+)min$/);
    if (!match) return { skipped: "summary not parseable" };
    const appName = match[1]!;
    const minutes = parseInt(match[2]!, 10);

    const thresholds = DEFAULT_THRESHOLDS_MIN[appName];
    if (!thresholds) return { skipped: "app not monitored" };
    const hitTier = thresholds.findIndex((t) => minutes >= t);
    if (hitTier === -1) return { skipped: "below threshold" };

    const bursts = await step.run("compose", async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, the user's best friend over text. They've been on ${appName} for ${minutes} minutes, past their ${thresholds[hitTier]} minute threshold (tier ${hitTier + 1}/${thresholds.length}).

Generate a 2-3 burst nudge in friend voice. Lowercase. Blank lines between bursts. Each burst 3-10 words.
- Tier 1: light, slightly mocking, easy to ignore.
- Tier 2: firmer, more direct.
- Tier 3: deadpan tough-love.
Return only the bursts.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.9,
      });
      return completion.choices[0]?.message?.content ?? `u been on ${appName} ${minutes} min\n\nclose it`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${data.userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: `screentime_escalation_t${hitTier + 1}` }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId: data.userId, app: appName, minutes, tier: hitTier + 1 }, "escalation sent");
    return { sent: true, tier: hitTier + 1 };
  },
);
