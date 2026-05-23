// Predictive forecast agent.
//
// Nightly 2am UTC. For each active user, looks at the last 30 days of:
//   - Sleep aggregates (health.sleep)
//   - Workout aggregates (health.workout)
//   - Calendar density tomorrow + day-after
//   - Recent screen-time patterns
//   - Most recent affect signals (late-night, low-mood markers)
//
// Asks gpt-5.4 to predict tomorrow's risk for: low-energy, social-isolation,
// routine-skip, doom-scroll-likely. If any risk is high (>0.65), pre-schedules
// a soft nudge for the appropriate window via NudgeSchedule. This is what
// makes Aura *feel prescient* — caught a pattern before the user noticed.

import type { InngestFunction } from "inngest";
import OpenAI from "openai";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { env } from "../../env.js";
import { scheduleNudge } from "../../services/nudges.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

interface ForecastResult {
  low_energy?: number;
  social_isolation?: number;
  routine_skip?: number;
  doom_scroll?: number;
  notes?: string;
}

export const agentPredictiveForecast: InngestFunction.Any = inngest.createFunction(
  {
    id: "agent-predictive-forecast",
    triggers: [{ cron: "0 2 * * *" }], // daily 2am UTC
  },
  async ({ step, logger }) => {
    const users = await step.run("active-users", () =>
      prisma.user.findMany({
        where: { isOnboarded: true },
        select: { id: true, name: true, mutedUntil: true },
      }),
    );

    let nudgesScheduled = 0;
    for (const user of users) {
      if (user.mutedUntil && user.mutedUntil > new Date()) continue;
      try {
        const result = await forecastUser(user.id);
        if (result.nudges) nudgesScheduled += result.nudges;
      } catch (err) {
        logger.error({ err, userId: user.id }, "forecast failed");
      }
    }
    return { nudgesScheduled };
  },
);

async function forecastUser(userId: string): Promise<{ nudges: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dayAfter = new Date(Date.now() + 2 * 86_400_000);

  const [sleepSignals, workoutSignals, screenSignals, tomorrowEvents] = await Promise.all([
    prisma.signalEvent.findMany({
      where: { userId, kind: "health.sleep", occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      take: 14,
    }),
    prisma.signalEvent.findMany({
      where: { userId, kind: "health.workout", occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    prisma.signalEvent.findMany({
      where: { userId, kind: "screentime.session", occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    prisma.signalEvent.findMany({
      where: {
        userId,
        kind: "calendar.event",
        occurredAt: { gte: tomorrow, lte: dayAfter },
      },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  // If we have no signals at all, we can't forecast — skip silently.
  const totalSignals = sleepSignals.length + workoutSignals.length + screenSignals.length;
  if (totalSignals < 5) return { nudges: 0 };

  const sleepHints = sleepSignals.slice(0, 7).map((s) => s.summary).join("; ") || "(no sleep data)";
  const workoutCount = workoutSignals.length;
  const heavyScreen = screenSignals.filter((s) => /\b(3[0-9]|[4-9][0-9])min\b/.test(s.summary)).length;
  const tomorrowDensity = tomorrowEvents.length;

  const forecast = await callForecast({
    sleepHints,
    workoutCount,
    heavyScreen,
    tomorrowDensity,
    tomorrowEarliest: tomorrowEvents[0]?.summary,
  });

  let scheduled = 0;
  // High low-energy risk → schedule a gentle early-day nudge for 9am-ish.
  if ((forecast.low_energy ?? 0) >= 0.65) {
    const when = new Date(tomorrow);
    when.setUTCHours(9, 0, 0, 0);
    await scheduleNudge({
      userId,
      when,
      kind: "callback",
      payload: {
        topic: "low_energy_forecast",
        reason: forecast.notes,
      },
    });
    scheduled++;
  }
  if ((forecast.doom_scroll ?? 0) >= 0.7) {
    const when = new Date(tomorrow);
    when.setUTCHours(20, 30, 0, 0); // evening scroll-risk window
    await scheduleNudge({
      userId,
      when,
      kind: "callback",
      payload: {
        topic: "doom_scroll_forecast",
        reason: forecast.notes,
      },
    });
    scheduled++;
  }
  if ((forecast.social_isolation ?? 0) >= 0.6) {
    // Trigger relationship pulse early for this user.
    await inngest.send({
      name: "aura/agent.relationship_pulse_user",
      data: { userId },
    });
    scheduled++;
  }

  return { nudges: scheduled };
}

async function callForecast(args: {
  sleepHints: string;
  workoutCount: number;
  heavyScreen: number;
  tomorrowDensity: number;
  tomorrowEarliest?: string;
}): Promise<ForecastResult> {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You forecast tomorrow's risk levels for a user based on recent signals. Return JSON ONLY:
{
  "low_energy": 0-1,
  "social_isolation": 0-1,
  "routine_skip": 0-1,
  "doom_scroll": 0-1,
  "notes": "one-line reason"
}
Numbers should reflect how likely each risk is. Be conservative — only flag high (>0.65) when signals are clear.`,
        },
        {
          role: "user",
          content: `Last 7 nights of sleep: ${args.sleepHints}
Workouts in last 30 days: ${args.workoutCount}
Long screen sessions (30min+) in last 30 days: ${args.heavyScreen}
Tomorrow's calendar: ${args.tomorrowDensity} events. Earliest: ${args.tomorrowEarliest ?? "(none)"}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as ForecastResult;
  } catch {
    return {};
  }
}
