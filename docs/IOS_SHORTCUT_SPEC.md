# Aura Sync — iOS Shortcut spec

The iOS Shortcut bundle for Apple-bridged integrations (Calendar / Contacts /
Health / Photos / Notes / Phone log / Screen Time) hasn't been built as a
`.shortcut` binary file — those have to be authored in Apple's Shortcuts.app
on Mac or iPhone. This doc specifies exactly what each Shortcut should do
so anyone can build it.

The receiving API endpoints are already shipped:
- `POST /signals/:app/:webhookToken` (public, no Bearer auth — token-authed)

The token comes from `POST /internal/users/:id/integrations/connect` (see
`docs/SETUP_CHECKLIST.md` step 7e).

---

## Shared structure (all Shortcuts)

All Shortcuts post JSON to:
```
${webhookUrl}
Content-Type: application/json
Body: { "payload": <source-specific object below> }
```

`webhookUrl` is provided once when the user connects the integration via the
API. They paste it into the Shortcut once. The Shortcut runs:
- Daily (via iOS Automation: time-triggered)
- On-demand (Shortcut they tap from Home Screen)

Network errors should retry once with 30s backoff, then silently skip.

---

## 1. Apple Calendar (`apple_calendar`)

**Trigger:** daily 6am local + on-demand.

**Steps:**
1. Get Calendar Events (next 14 days, all calendars).
2. Filter out all-day events with no attendees (too noisy).
3. Map each to:
   ```json
   {
     "summary": "<event.title>",
     "start": { "dateTime": "<event.startDate ISO 8601>" },
     "end":   { "dateTime": "<event.endDate ISO 8601>" },
     "attendees": [ { "displayName": "<attendee.name>", "email": "<attendee.email>" } ],
     "location": "<event.location>"
   }
   ```
4. POST as `{ "payload": { "events": [...] } }`.

---

## 2. Apple Contacts (`apple_contacts`)

**Trigger:** weekly Monday 7am local + on-demand.

**Steps:**
1. Get All Contacts.
2. For each contact, build:
   ```json
   {
     "names":          [{ "displayName": "<full name>", "givenName": "<first>", "familyName": "<last>" }],
     "phoneNumbers":   [{ "value": "<+E.164>" }],
     "emailAddresses": [{ "value": "<email>" }]
   }
   ```
3. POST as `{ "payload": { "connections": [...] } }`.

Note: contacts seed the knowledge graph; they're not periodic signals.
Once a week is plenty.

---

## 3. Apple Health (`apple_health`)

**Trigger:** daily 7am local.

**Steps:**
1. Get Health Sample (Steps, last 7 days, sum-by-day).
2. Get Health Sample (Workout, last 7 days).
3. Get Health Sample (Sleep Analysis, last 7 days, asleep total).
4. Aggregate per day:
   ```json
   {
     "date": "YYYY-MM-DD",
     "steps": <int>,
     "workouts": [
       { "type": "Run|Cycling|Yoga|...", "durationMin": <int>, "startedAt": "<ISO 8601>" }
     ],
     "sleep": { "totalHours": <float>, "bedtime": "HH:MM", "wake": "HH:MM" }
   }
   ```
5. POST as `{ "payload": { "days": [...] } }`.

---

## 4. Apple Photos (`apple_photos`) — metadata only

**Trigger:** weekly Sunday 10pm local + on-demand.
**Privacy:** never sends raw images. Only metadata.

**Steps:**
1. Find Photos where Date Taken is in the last 7 days.
2. For each photo, build:
   ```json
   {
     "takenAt": "<ISO 8601>",
     "location": { "lat": <float>, "lon": <float>, "name": "<city>" },
     "faces": ["<known person name>", ...]
   }
   ```
   Use the "People" album to map face-cluster IDs to names you've tagged.
3. POST as `{ "payload": { "photos": [...] } }`.

---

## 5. Apple Notes (`apple_notes`) — tagged subset

**Trigger:** daily 8pm local.
**Filter:** only notes containing `#aura` (so the user opts in note-by-note).

**Steps:**
1. Find Notes containing "#aura" modified in the last 24h.
2. Map each to:
   ```json
   {
     "id": "<note.uuid>",
     "title": "<first line>",
     "body": "<full text>",
     "tags": ["aura", ...other tags...],
     "updatedAt": "<ISO 8601>"
   }
   ```
3. POST as `{ "payload": { "notes": [...] } }`.

---

## 6. Apple Phone Log (`apple_phone_log`)

**Trigger:** on-demand only (iOS doesn't expose call-log automation).

**Steps:**
This one's hardest — iOS doesn't expose Phone Log to Shortcuts directly.
Workarounds (pick one):
- **Workaround A**: a Focus filter that fires when a call ends, runs a
  Shortcut that captures the call ID + duration via the Phone app's
  "Recents" intent (iOS 17+).
- **Workaround B**: manual — user runs Shortcut after a missed call,
  which captures only that call's metadata.

(A CallKit companion app workaround was previously listed here — it's
been cut because shipping a companion app violates Aura's "no native app
ever" rule. If you genuinely need full call-log automation, the right move
is to wait for Apple to expose the Phone Log via Shortcuts.)

Payload (one call per array entry):
```json
{
  "startedAt": "<ISO 8601>",
  "durationSec": <int>,
  "direction": "incoming|outgoing|missed",
  "number": "<+E.164>",
  "contactName": "<resolved name or null>"
}
```
POST as `{ "payload": { "calls": [...] } }`.

---

## 7. Screen Time (`apple_screen_time`)

**Trigger:** Focus filter automation on app close, OR daily 11pm local.

**Steps:**
1. Get Screen Time data (per-app, last 24h). iOS exposes this via
   ScreenTime APIs; in Shortcuts use the "Get Screen Time" action.
2. For each app session ≥10 min, build:
   ```json
   {
     "app": "Instagram",
     "startedAt": "<ISO 8601 session start>",
     "endedAt":   "<ISO 8601 session end>",
     "durationSec": <int>
   }
   ```
3. POST as `{ "payload": { "sessions": [...] } }`.

The screen-time escalation agent only monitors Instagram, TikTok, X
(thresholds in `apps/api/src/inngest/functions/agentScreenTimeEscalation.ts`).

---

## iCloud Mail (`icloud_mail`)

**Trigger:** push-style — when a new email arrives, Mail's Focus filter
fires the Shortcut.

**Steps:**
1. Get details of the latest unread email.
2. Map to:
   ```json
   {
     "id": "<message-id>",
     "from": "<sender display>",
     "subject": "<subject line>",
     "receivedAt": "<ISO 8601>",
     "snippet": "<first 200 chars — metadata-mode only, NOT full body>"
   }
   ```
3. POST as `{ "payload": { "messages": [<one entry>] } }`.

The email triage agent processes one-at-a-time. Body access requires the
user opt in via `PATCH /users/:id/integrations/icloud_mail` with
`{ "settings": { "bodyOptIn": true } }`.

---

## Distribution format

When the Shortcut is built, distribute via:
1. **iCloud share link** — Apple's native flow, easiest for users.
2. **Embedded in the Aura app** (when there is one) — auto-installs.
3. **Documentation** — paste the steps for users to manually replicate.

For development you can also export the Shortcut as a `.shortcut` file
(binary plist) and host it on the marketing site. Users tap to install.

---

## Testing the integration end-to-end

Without an actual Shortcut, simulate from the command line:

```bash
# Get a webhook token
curl -X POST http://localhost:3001/internal/users/<USER_ID>/integrations/connect \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"app":"apple_health"}'
# → { "webhookToken": "abc123...", "webhookUrl": "..." }

# Simulate a Health push
curl -X POST http://localhost:3001/signals/apple_health/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{"payload":{"days":[{"date":"2026-05-19","steps":8234,"sleep":{"totalHours":7.4,"bedtime":"23:14","wake":"06:38"}}]}}'

# Check it landed
psql $DATABASE_URL -c "SELECT kind, summary FROM signal_events ORDER BY occurred_at DESC LIMIT 5"
```

You should see rows like:
```
health.sleep | Slept 7.4h (bed 23:14 → wake 06:38)
health.steps | 8,234 steps on 2026-05-19
```
