// Normalize raw integration payloads into SignalEvent rows.
//
// Each connector pushes its own shape; the normalize function converts to:
//   { kind, occurredAt, summary, payload }
// We keep the source payload in `payload` so downstream agents can dig in
// when they need details — but the `summary` + `kind` is enough for the
// memory layer to do its job.

import type { AppId } from "./registry.js";

export interface NormalizedEvent {
  kind: string;
  occurredAt: Date;
  summary: string;
  payload: Record<string, unknown>;
}

interface CalendarEvent {
  id?: string;
  summary?: string;
  title?: string;
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; name?: string; displayName?: string }>;
  location?: string;
  description?: string;
}

interface SpotifyTrack {
  played_at?: string;
  played_at_ms?: number;
  track?: { name?: string; artists?: Array<{ name?: string }>; album?: { name?: string } };
}

interface HealthDailyAggregate {
  date: string;
  steps?: number;
  workouts?: Array<{ type?: string; durationMin?: number; calories?: number; startedAt?: string }>;
  sleep?: { totalHours?: number; bedtime?: string; wake?: string };
}

interface PhoneCallRecord {
  startedAt: string;
  durationSec: number;
  direction: "incoming" | "outgoing" | "missed";
  number?: string;
  contactName?: string;
}

interface AppleNote {
  id?: string;
  title?: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

interface ScreenTimeSession {
  app: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
}

interface MailMessage {
  id?: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
  snippet?: string;
}

interface PhotoMetadata {
  takenAt?: string;
  location?: { lat?: number; lon?: number; name?: string };
  faces?: string[]; // cluster IDs / known person names
}

interface PlaidTransaction {
  transaction_id?: string;
  date?: string;
  authorized_date?: string;
  amount?: number; // positive = outflow (Plaid convention)
  iso_currency_code?: string;
  name?: string;
  merchant_name?: string;
  category?: string[];
  pending?: boolean;
  payment_channel?: string; // "online" | "in store" | "other"
}

/**
 * Normalize a raw payload from a given source.
 * Returns a list of NormalizedEvents (one source push can contain many records).
 */
export function normalize(source: AppId, raw: unknown): NormalizedEvent[] {
  switch (source) {
    case "google_calendar":
    case "apple_calendar":
      return normalizeCalendar(source, raw);
    case "spotify":
      return normalizeSpotify(raw);
    case "apple_health":
      return normalizeHealth(raw);
    case "apple_phone_log":
      return normalizePhoneLog(raw);
    case "apple_notes":
      return normalizeNotes(raw);
    case "apple_screen_time":
      return normalizeScreenTime(raw);
    case "gmail":
    case "icloud_mail":
      return normalizeMail(source, raw);
    case "apple_photos":
      return normalizePhotos(raw);
    case "google_contacts":
    case "apple_contacts":
      // Contacts don't generate timely events — they're ingested via
      // bootstrap into the knowledge graph instead. Returning [] is correct.
      return [];
    case "plaid":
      return normalizePlaid(raw);
    default:
      return [];
  }
}

function normalizePlaid(raw: unknown): NormalizedEvent[] {
  const txns = asArray<PlaidTransaction>(raw, "transactions") ?? asArray<PlaidTransaction>(raw);
  if (!txns) return [];
  return txns
    .filter((t) => !t.pending && t.amount != null && t.date)
    .map((t): NormalizedEvent => {
      const amt = t.amount!;
      const merchant = t.merchant_name ?? t.name ?? "unknown merchant";
      const sign = amt >= 0 ? "spent" : "received";
      const abs = Math.abs(amt).toFixed(2);
      const cur = t.iso_currency_code ?? "USD";
      return {
        kind: "money.transaction",
        occurredAt: new Date(t.date!),
        summary: `${sign} ${cur} ${abs} at ${merchant}`,
        payload: {
          merchant,
          amount: amt,
          currency: cur,
          category: t.category ?? [],
          channel: t.payment_channel ?? "unknown",
          transaction_id: t.transaction_id,
        },
      };
    });
}

function normalizeCalendar(source: AppId, raw: unknown): NormalizedEvent[] {
  const events = (asArray<CalendarEvent>(raw, "events") ?? asArray<CalendarEvent>(raw)) ?? [];
  return events
    .map((e): NormalizedEvent | null => {
      const startStr =
        typeof e.start === "string"
          ? e.start
          : e.start?.dateTime ?? e.start?.date ?? undefined;
      if (!startStr) return null;
      const occurredAt = new Date(startStr);
      const title = e.summary ?? e.title ?? "(untitled event)";
      const attendees = (e.attendees ?? [])
        .map((a) => a.displayName ?? a.name ?? a.email ?? "")
        .filter(Boolean);
      const withClause = attendees.length ? ` with ${attendees.slice(0, 3).join(", ")}` : "";
      return {
        kind: "calendar.event",
        occurredAt,
        summary: `${title}${withClause}`,
        payload: { source, ...e },
      };
    })
    .filter((x): x is NormalizedEvent => !!x);
}

function normalizeSpotify(raw: unknown): NormalizedEvent[] {
  const items = asArray<SpotifyTrack>(raw, "items") ?? asArray<SpotifyTrack>(raw) ?? [];
  return items
    .map((t): NormalizedEvent | null => {
      const when = t.played_at ?? (t.played_at_ms ? new Date(t.played_at_ms).toISOString() : null);
      if (!when || !t.track?.name) return null;
      const artist = t.track.artists?.map((a) => a.name).filter(Boolean).join(", ") ?? "unknown artist";
      return {
        kind: "spotify.track_played",
        occurredAt: new Date(when),
        summary: `Played "${t.track.name}" by ${artist}`,
        payload: { track: t.track },
      };
    })
    .filter((x): x is NormalizedEvent => !!x);
}

function normalizeHealth(raw: unknown): NormalizedEvent[] {
  const days = asArray<HealthDailyAggregate>(raw, "days") ?? asArray<HealthDailyAggregate>(raw);
  if (!days) return [];
  const out: NormalizedEvent[] = [];
  for (const d of days) {
    const date = d.date;
    if (!date) continue;
    const dayStart = new Date(`${date}T00:00:00Z`);
    if (typeof d.steps === "number") {
      out.push({
        kind: "health.steps",
        occurredAt: dayStart,
        summary: `${d.steps.toLocaleString()} steps on ${date}`,
        payload: { steps: d.steps, date },
      });
    }
    for (const w of d.workouts ?? []) {
      out.push({
        kind: "health.workout",
        occurredAt: w.startedAt ? new Date(w.startedAt) : dayStart,
        summary: `${w.type ?? "workout"} for ${w.durationMin ?? "?"} min`,
        payload: { workout: w, date },
      });
    }
    if (d.sleep?.totalHours) {
      out.push({
        kind: "health.sleep",
        occurredAt: dayStart,
        summary: `Slept ${d.sleep.totalHours.toFixed(1)}h (bed ${d.sleep.bedtime ?? "?"} → wake ${d.sleep.wake ?? "?"})`,
        payload: { sleep: d.sleep, date },
      });
    }
  }
  return out;
}

function normalizePhoneLog(raw: unknown): NormalizedEvent[] {
  const calls = asArray<PhoneCallRecord>(raw, "calls") ?? asArray<PhoneCallRecord>(raw);
  if (!calls) return [];
  return calls.map((c): NormalizedEvent => {
    const who = c.contactName ?? c.number ?? "unknown";
    const dur = Math.round((c.durationSec ?? 0) / 60);
    return {
      kind: c.direction === "missed" ? "phone.missed" : `phone.${c.direction}`,
      occurredAt: new Date(c.startedAt),
      summary:
        c.direction === "missed"
          ? `Missed call from ${who}`
          : `${dur}min call ${c.direction === "outgoing" ? "to" : "from"} ${who}`,
      payload: c as unknown as Record<string, unknown>,
    };
  });
}

function normalizeNotes(raw: unknown): NormalizedEvent[] {
  const notes = asArray<AppleNote>(raw, "notes") ?? asArray<AppleNote>(raw);
  if (!notes) return [];
  return notes.map((n): NormalizedEvent => ({
    kind: "notes.entry",
    occurredAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
    summary: n.title ? `Note: ${n.title}` : `Note: ${n.body.slice(0, 80)}…`,
    payload: { id: n.id, title: n.title, body: n.body, tags: n.tags ?? [] },
  }));
}

function normalizeScreenTime(raw: unknown): NormalizedEvent[] {
  const sessions = asArray<ScreenTimeSession>(raw, "sessions") ?? asArray<ScreenTimeSession>(raw);
  if (!sessions) return [];
  return sessions.map((s): NormalizedEvent => ({
    kind: "screentime.session",
    occurredAt: new Date(s.startedAt),
    summary: `${s.app} for ${Math.round(s.durationSec / 60)}min`,
    payload: s as unknown as Record<string, unknown>,
  }));
}

function normalizeMail(source: AppId, raw: unknown): NormalizedEvent[] {
  const msgs = asArray<MailMessage>(raw, "messages") ?? asArray<MailMessage>(raw);
  if (!msgs) return [];
  return msgs.map((m): NormalizedEvent => ({
    kind: "mail.received",
    occurredAt: m.receivedAt ? new Date(m.receivedAt) : new Date(),
    summary: `Email from ${m.from ?? "?"}: ${m.subject ?? "(no subject)"}`,
    payload: { source, id: m.id, from: m.from, subject: m.subject, snippet: m.snippet },
  }));
}

function normalizePhotos(raw: unknown): NormalizedEvent[] {
  const photos = asArray<PhotoMetadata>(raw, "photos") ?? asArray<PhotoMetadata>(raw);
  if (!photos) return [];
  return photos
    .filter((p) => !!p.takenAt)
    .map((p): NormalizedEvent => ({
      kind: "photo.taken",
      occurredAt: new Date(p.takenAt!),
      summary: p.faces?.length
        ? `Photo with ${p.faces.slice(0, 3).join(", ")}`
        : "Photo taken",
      payload: { location: p.location, faces: p.faces ?? [] },
    }));
}

// Pull either an array directly, or the array at `raw[key]` if `raw` is an
// object with that key. Returns null otherwise.
function asArray<T>(raw: unknown, key?: string): T[] | null {
  if (Array.isArray(raw)) return raw as T[];
  if (key && raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v as T[];
  }
  return null;
}
