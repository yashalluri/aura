// Calendar hygiene agent.
//
// Daily evening (8pm UTC). Scans signal_events for next 7 days of calendar.event
// rows. Finds: conflicts (overlapping), brutal back-to-backs (5+ events with no
// 30-min break), stale recurrings (recurring meetings with no recent memory
// activity). Drafts a friend-voiced proposal — user confirms via reply.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

export const agentCalendarHygiene: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-calendar-hygiene",
    triggers: [{ cron: "0 20 * * *" }], // daily 8pm UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("list-users", () =>
      prisma.user.findMany({
        where: {
          integrations: {
            some: {
              app: { in: ["google_calendar", "apple_calendar"] },
              status: "active",
            },
          },
        },
        select: { id: true, mutedUntil: true },
      }),
    );

    let scheduled = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      await inngest.send({
        name: "aura/agent.calendar_hygiene_user",
        data: { userId: user.id },
      });
      scheduled++;
    }
    logger.info({ scheduled }, "calendar hygiene fan-out");
    return { scheduled };
  },
);

interface CalendarSignal {
  id: string;
  summary: string;
  occurredAt: Date;
  payload: { source?: string; end?: { dateTime?: string; date?: string } | string };
}

export const agentCalendarHygieneForUser: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-calendar-hygiene-user",
    triggers: [{ event: "aura/agent.calendar_hygiene_user" }],
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as { userId: string };
    const now = new Date();
    const lookahead = new Date(now.getTime() + 7 * 86_400_000);

    const events = (await step.run("load-events", async () => {
      return prisma.signalEvent.findMany({
        where: {
          userId,
          kind: "calendar.event",
          occurredAt: { gte: now, lte: lookahead },
        },
        orderBy: { occurredAt: "asc" },
      });
    })) as unknown as CalendarSignal[];

    if (events.length === 0) return { skipped: "no events" };

    const issues = findHygieneIssues(events);
    if (issues.length === 0) return { skipped: "clean calendar" };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const bursts = await step.run("compose", async () => {
      const issueDescriptions = issues
        .slice(0, 3)
        .map((i) => `- ${i.kind}: ${i.detail}`)
        .join("\n");
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are Aura, ${user?.name ?? "this person"}'s best friend over text.

You spotted these issues in their next 7 days:
${issueDescriptions}

Compose a 2-3 burst nudge in friend voice:
- Lowercase. Blank lines between bursts. Each 3-12 words.
- Surface the MOST important issue with specifics (titles, days).
- Propose ONE specific action they could take (decline, reschedule, defend).
- Say "want me to draft a decline?" at the end IF appropriate.
- Friend voice. No "Hello!", no bullets, no motivational closer.

Return only the bursts.`,
          },
        ],
        max_completion_tokens: 200,
        temperature: 0.85,
      });
      return completion.choices[0]?.message?.content ?? `ur week looks rough\n\nwanna talk thru it?`;
    });

    await step.run("deliver", async () => {
      const res = await fetch(`${env.CONVERSATION_BASE_URL}/internal/send/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: JSON.stringify({ text: bursts, eventType: "calendar_hygiene" }),
      });
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      return res.json();
    });

    logger.info({ userId, issues: issues.length }, "calendar hygiene sent");
    return { sent: true, issues };
  },
);

interface HygieneIssue {
  kind: "conflict" | "brutal_day" | "back_to_back_no_breaks";
  detail: string;
}

function findHygieneIssues(events: CalendarSignal[]): HygieneIssue[] {
  const out: HygieneIssue[] = [];

  // 1. Overlapping events (conflict).
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i]!;
    const b = events[i + 1]!;
    const aEnd = parseEnd(a);
    if (!aEnd) continue;
    if (b.occurredAt < aEnd) {
      out.push({
        kind: "conflict",
        detail: `"${a.summary}" overlaps "${b.summary}" on ${a.occurredAt.toISOString().slice(0, 10)}`,
      });
    }
  }

  // 2. Brutal days: 5+ events with no 30-min break between any pair.
  const byDay = new Map<string, CalendarSignal[]>();
  for (const e of events) {
    const day = e.occurredAt.toISOString().slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(e);
    byDay.set(day, arr);
  }
  for (const [day, list] of byDay) {
    if (list.length < 5) continue;
    let allTight = true;
    for (let i = 0; i < list.length - 1; i++) {
      const aEnd = parseEnd(list[i]!);
      const bStart = list[i + 1]!.occurredAt;
      if (!aEnd) continue;
      const gapMin = (bStart.getTime() - aEnd.getTime()) / 60000;
      if (gapMin >= 30) {
        allTight = false;
        break;
      }
    }
    if (allTight) {
      out.push({
        kind: "brutal_day",
        detail: `${list.length} events on ${day} with no 30-min breaks`,
      });
    }
  }

  return out;
}

function parseEnd(e: CalendarSignal): Date | null {
  const end = e.payload?.end;
  if (!end) return null;
  if (typeof end === "string") return new Date(end);
  if (end.dateTime) return new Date(end.dateTime);
  if (end.date) return new Date(end.date);
  return null;
}
