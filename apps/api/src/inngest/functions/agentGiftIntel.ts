// Gift intelligence agent.
//
// Daily 10am UTC. For each user, finds contacts with a birthday in the next
// 14 days. For each one, semantic-recalls memories about that person, then
// asks the LLM for 3 gift ideas grounded in those memories. Sends one nudge
// per contact (with a 7-day cooldown so we don't ping daily).

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { retrieveMemories } from "../../services/memory.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentGiftIntel: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-gift-intel",
    triggers: [{ cron: "0 10 * * *" }], // daily 10am UTC
  },
  async ({ step, logger }) => {
    const now = new Date();
    const upcoming = new Date(now.getTime() + 14 * 86_400_000);

    // Birthdays in the next 14 days — we compare month/day, ignoring year.
    const contacts = await step.run("birthdays-soon", () =>
      prisma.contact.findMany({
        where: { birthday: { not: null } },
        include: { user: { select: { id: true, name: true, mutedUntil: true } } },
      }),
    );

    type ContactWithUser = (typeof contacts)[number];

    const candidates = (contacts as ContactWithUser[]).filter((c) => {
      if (!c.birthday) return false;
      if (c.user.mutedUntil && c.user.mutedUntil > now) return false;
      const bday = new Date(c.birthday);
      const thisYearBday = new Date(now.getUTCFullYear(), bday.getUTCMonth(), bday.getUTCDate());
      const nextYearBday = new Date(now.getUTCFullYear() + 1, bday.getUTCMonth(), bday.getUTCDate());
      // Use whichever is upcoming.
      const target = thisYearBday >= now ? thisYearBday : nextYearBday;
      return target >= now && target <= upcoming;
    });

    let sent = 0;
    for (const c of candidates) {
      try {
        // Cooldown: skip if we sent a gift intel for this contact in the last 7 days.
        const recent = await prisma.outboundMessage.findFirst({
          where: {
            userId: c.user.id,
            eventType: `gift_intel:${c.id}`,
            sentAt: { gt: new Date(now.getTime() - 7 * 86_400_000) },
          },
        });
        if (recent) continue;

        const memories = await retrieveMemories(c.user.id, c.name, 8);
        if (!memories.length) continue;

        const memHints = memories
          .slice(0, 5)
          .map((m) => `- ${m.content}`)
          .join("\n");

        const bday = new Date(c.birthday!);
        const thisYearBday = new Date(now.getUTCFullYear(), bday.getUTCMonth(), bday.getUTCDate());
        const targetDate = thisYearBday >= now ? thisYearBday : new Date(now.getUTCFullYear() + 1, bday.getUTCMonth(), bday.getUTCDate());
        const daysUntil = Math.floor((targetDate.getTime() - now.getTime()) / 86_400_000);

        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: `You are Aura, ${c.user.name ?? "this person"}'s best friend over text.

${c.name}'s birthday is in ${daysUntil} days. Based on what you remember about ${c.name}:
${memHints}

Compose a 3-4 burst gift nudge:
- Lowercase. Blank lines between. Each 3-12 words.
- First burst: heads-up about the birthday.
- 2-3 specific gift ideas grounded in what we know (use ${c.name}'s actual interests/mentions from above).
- NOT generic ("a nice book"). Specific ("that camera lens she keeps complaining about").
- Friend voice. No "Here are some ideas".

Return only the bursts.`,
            },
          ],
          max_completion_tokens: 250,
          temperature: 0.85,
        });
        const bursts = completion.choices[0]?.message?.content;
        if (!bursts) continue;

        const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${c.user.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({ text: bursts, eventType: `gift_intel:${c.id}` }),
        });
        if (res.ok) {
          await prisma.outboundMessage.create({
            data: {
              userId: c.user.id,
              channel: "imessage",
              eventType: `gift_intel:${c.id}`,
              body: bursts,
            },
          });
          sent++;
        }
      } catch (err) {
        logger.error({ err, contactId: c.id }, "gift intel failed");
      }
    }

    return { sent, candidates: candidates.length };
  },
);
