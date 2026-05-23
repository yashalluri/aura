// Signal ingestion service.
//
// Every connector lands here via `ingestNormalized`. We:
//   1. Persist a SignalEvent row.
//   2. Selectively extract a Memory from high-signal events (workout
//      completed, big calendar event, etc).
//   3. Optionally emit a follow-up Inngest event so background agents can react.

import type { NormalizedEvent } from "../integrations/normalize.js";
import { prisma } from "../lib/db.js";
import { writeMemory } from "./memory.js";
import { inngest } from "../inngest/client.js";

interface IngestArgs {
  userId: string;
  source: string;
  events: NormalizedEvent[];
}

// Event kinds that we surface to background agents in real time.
const FAN_OUT_KINDS = new Set([
  "calendar.event",
  "phone.missed",
  "screentime.session",
  "mail.received",
]);

// Kinds that auto-promote to a memory (one-shot, semantic-deduped).
const PROMOTE_TO_MEMORY: Array<{ kind: string; memoryKind: "event" | "preference" | "pattern"; importance: number }> = [
  { kind: "health.workout", memoryKind: "event", importance: 0.4 },
  { kind: "notes.entry", memoryKind: "event", importance: 0.55 },
  { kind: "calendar.event", memoryKind: "event", importance: 0.35 },
  { kind: "spotify.track_played", memoryKind: "preference", importance: 0.25 },
];

export async function ingestNormalized({ userId, source, events }: IngestArgs): Promise<{ persisted: number; promoted: number }> {
  if (!events.length) return { persisted: 0, promoted: 0 };

  // Bulk insert via createMany — fast, no per-row round-trips.
  const data = events.map((e) => ({
    userId,
    source,
    kind: e.kind,
    occurredAt: e.occurredAt,
    summary: e.summary,
    payload: e.payload as object,
  }));
  await prisma.signalEvent.createMany({ data });

  // Memory promotion (best-effort, fire-and-forget per row).
  let promoted = 0;
  for (const e of events) {
    const promote = PROMOTE_TO_MEMORY.find((p) => p.kind === e.kind);
    if (!promote) continue;
    await writeMemory({
      userId,
      kind: promote.memoryKind,
      content: e.summary,
      source: `integration:${source}`,
      importance: promote.importance,
      attrs: e.payload,
    }).then((m) => {
      if (m) promoted++;
    }).catch((err) => {
      console.error("memory promotion failed", err);
    });
  }

  // Fan out events that agents care about.
  const toFanOut = events.filter((e) => FAN_OUT_KINDS.has(e.kind));
  if (toFanOut.length) {
    await inngest
      .send(
        toFanOut.map((e) => ({
          name: "aura/signal.event" as const,
          data: {
            userId,
            source,
            kind: e.kind,
            occurredAt: e.occurredAt.toISOString(),
            summary: e.summary,
          },
        })),
      )
      .catch((err) => console.error("inngest signal fan-out failed", err));
  }

  return { persisted: data.length, promoted };
}

/**
 * Mark a SignalEvent as ingested (or failed). Called by post-processing jobs.
 */
export async function markIngested(id: string, err?: string): Promise<void> {
  await prisma.signalEvent.update({
    where: { id },
    data: { ingested: !err, ingestErr: err ?? null },
  });
}

/**
 * List recent events for a user. Used by background agents to build prompts.
 */
export async function recentSignals(
  userId: string,
  options: { since?: Date; source?: string; limit?: number } = {},
) {
  const where: { userId: string; occurredAt?: { gte: Date }; source?: string } = { userId };
  if (options.since) where.occurredAt = { gte: options.since };
  if (options.source) where.source = options.source;
  return prisma.signalEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: options.limit ?? 100,
  });
}
