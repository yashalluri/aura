# Aura — master setup checklist (Sprints 1-10)

Do this top to bottom. Each ✅ is one action on your side. Plan ~90 min if
you do everything; ~30 min for the minimum-viable path (steps 0-6 + 9).

The **minimum viable path** ships a working bestie-over-text with memory.
Optional sections (Composio integrations, voice mode, group chat) layer on.

---

## 0. Prereqs (5 min)

- ✅ **Node ≥20**: `node --version`
- ✅ **Supabase project** (or any Postgres ≥14 with extension privileges). Get `DATABASE_URL` (pooled, port 6543) + `DIRECT_URL` (direct, port 5432) from Project Settings → Database.
- ✅ **OpenAI account** with billing. Get an API key from platform.openai.com.
- ✅ **Photon Spectrum** account with an iMessage line. You already have `PHOTON_PROJECT_ID/SECRET/LINE_NUMBER`.
- ✅ **Inngest** account (optional in dev — the CLI dev server works without auth).

---

## 1. Verify OpenAI model availability (2 min)

Aura uses 4 OpenAI models:

| Model | Used for |
|---|---|
| `gpt-5.4-mini` | default chat + most agents + memory extraction + drafting |
| `gpt-5.4` | escalation on affect-heavy turns |
| `gpt-5.4-nano` | group address classifier + email triage + inside-joke detection |
| `text-embedding-3-small` | memory + entity embeddings (1536 dim) |

- ✅ Run: `curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models | grep -E "gpt-5.4|embedding-3"`
- ✅ If `gpt-5.4` family isn't available in your account, **substitute** in these files (find/replace, then commit):
  - Replace `gpt-5.4-mini` → `gpt-4o-mini`
  - Replace `gpt-5.4-nano` → `gpt-4o-mini`
  - Replace `gpt-5.4"` → `gpt-4o"` (keep the closing quote to avoid matching mini)
  - Files: `apps/conversation/src/llm/aura.ts`, `apps/conversation/src/lib/actions.ts`, `apps/conversation/src/lib/groupRouter.ts`, every file in `apps/api/src/inngest/functions/agent*.ts`, `apps/api/src/inngest/functions/memoryExtract.ts`, `apps/api/src/inngest/functions/nudgeDispatcher.ts`
- ✅ `text-embedding-3-small` is stable — no swap needed.

---

## 2. Generate secrets (2 min)

```bash
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"
echo "KMS_ROOT_KEY=$(openssl rand -hex 32)"
```

- ✅ Save BOTH to a password manager. **`KMS_ROOT_KEY` is critical** — lose it and every encrypted memory becomes permanently unreadable.

---

## 3. Fill in `.env` at repo root (5 min)

Template in `.env.example`. Required keys:

```ini
NODE_ENV=development
API_PORT=3001
CONVERSATION_PORT=3002

DATABASE_URL="<pooled supabase string, port 6543>"
DIRECT_URL="<direct supabase string, port 5432>"

INTERNAL_API_SECRET=<from step 2>
KMS_ROOT_KEY=<from step 2>

OPENAI_API_KEY=<from platform.openai.com>

PHOTON_PROJECT_ID=<from Photon dashboard>
PHOTON_PROJECT_SECRET=<from Photon dashboard>
PHOTON_LINE_NUMBER=<your Photon iMessage line>

API_BASE_URL="http://localhost:3001"
CONVERSATION_BASE_URL="http://localhost:3002"

# Optional — Sprint 3 (Composio integrations). Skip to disable integrations.
COMPOSIO_API_KEY=

# Optional — Sprint 6/8 (Inngest cloud). Leave blank for local dev.
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Optional — Sprint 10 (voice mode). Skip to disable Aura's phone number.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VOICE_NUMBER=
PUBLIC_BASE_URL=

# Optional — Sprint 10 (better TTS than Twilio's default Polly).
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

- ✅ Save `.env`.

---

## 4. Enable pgvector in Supabase (1 min)

- ✅ Supabase → Database → Extensions → toggle `vector` ON. Or in SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`

---

## 5. Install + generate + migrate (5 min)

From the repo root:

```bash
npm install
npx prisma generate --schema=apps/api/prisma/schema.prisma
npm run db:migrate --workspace apps/api
```

This applies all 7 migrations in order:

| # | Migration | Adds |
|---|---|---|
| Sprint 2 | `20260519_add_memory_and_graph` | Message, Memory (pgvector), Entity, Relation |
| Sprint 3 | `20260520_add_integrations_and_signals` | IntegrationConnection, SignalEvent |
| Sprint 4 | `20260521_add_encryption_and_audit` | User.encKey, MemoryAccess |
| Sprint 5 | `20260522_add_group_chats` | GroupSpace, GroupParticipant, GroupMemory, Message group fields |
| Sprint 7 | `20260523_add_goals_and_nudges` | Goal, Milestone, NudgeSchedule |

- ✅ Confirm migration succeeds.

Sanity check in Supabase SQL editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Should list 18 tables.

---

## 6. Verify all tests pass (1 min)

```bash
npm run conversation:test  # expect: 86 tests, 0 fail
npm run api:test            # expect: 42 tests, 0 fail
```

- ✅ 128 tests pass.

---

## 7. Composio integrations (10 min) — OPTIONAL

Skip this to ship Aura as a chat + memory bestie without integrations.
With integrations Aura gets a knowledge-graph cold start, calendar
hygiene, money pulse, etc.

- ✅ Sign up at **composio.dev**, get an API key.
- ✅ Add to `.env`: `COMPOSIO_API_KEY=<key>`.
- ✅ `npm install @composio/core --workspace apps/api`.
- ✅ In Composio's dashboard, enable each app you want and configure OAuth credentials per their walk-through:

| App | Composio slug | Used by |
|---|---|---|
| Google Calendar | `googlecalendar` | calendar hygiene, morning brief, sleep wind-down |
| Google Contacts | `googlecontacts` | knowledge graph cold start |
| Gmail | `gmail` | email triage agent |
| Spotify | `spotify` | taste signal, future mood pulse |
| Plaid | `plaid` | money pulse agent (Sprint 9) |

- ✅ Set Composio's OAuth callback URL to: `<your-api-base>/internal/integrations/oauth-callback`.
- ✅ Apple-bridged integrations (Calendar, Contacts, Health, Photos, Notes, Phone log, Screen Time) require the **Aura Sync iOS Shortcut** — not yet authored (Sprint 11). Endpoints are ready at `POST /signals/:app/:webhookToken`.

---

## 8. Inngest (2 min)

Aura has 26 Inngest functions. They auto-register against the API's webhook handler.

### Local dev:

```bash
npm install -g inngest-cli
inngest dev
# Then in separate terminals:
npm run api:dev
npm run conversation:dev
```

- ✅ Inngest auto-discovers functions from your local API.

### Production:

- ✅ app.inngest.com → your project → add the API webhook URL (e.g. `https://your-api/api/inngest`).
- ✅ Add `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` to `.env`.

### Cron schedule cheat-sheet:

| Time (UTC) | What |
|---|---|
| Every 15 min | daily-checkin scheduler |
| Every 5 min | nudge dispatcher |
| Daily 5pm | re-engagement scan |
| Daily 8am | email digest |
| Daily 8pm | calendar hygiene |
| Daily 10am | gift intel (birthdays in next 14d) |
| Daily 10:30pm | sleep wind-down |
| Wed 4pm | soft commitments |
| Fri 6pm | goal review |
| Sun 4am | memory decay |
| Sun 6pm | money pulse |
| Sun 7pm | relationship pulse |
| Dec 28 7pm | yearly review |

If any time is wrong for you, edit the `cron:` field in the corresponding `apps/api/src/inngest/functions/*.ts` file.

---

## 9. Smoke test end-to-end (5 min)

Start servers (or in production, deploy):

```bash
npm run api:dev          # terminal 1
npm run conversation:dev # terminal 2
inngest dev              # terminal 3 (dev only)
```

Text your Photon line. Expect:

- ✅ Aura replies in **2-4 separate iMessages** with 300-800ms gaps, lowercase, no AI-isms.
- ✅ Check: `SELECT id, role, LEFT(content, 80), created_at FROM messages ORDER BY created_at DESC LIMIT 10;` — both messages appear.
- ✅ Wait ~30s. Check: `SELECT id, kind, LEFT(content, 80) FROM memories ORDER BY created_at DESC LIMIT 5;` — a memory row from the extract job appears.
- ✅ Verify encryption: `SELECT content FROM memories LIMIT 1;` — starts with `v1:`.

Then test the agent actions by texting:

- ✅ **Remember**: "remember that I prefer iced coffee" → `SELECT * FROM memories WHERE source = 'conversation:manual';`
- ✅ **Reminder**: "remind me to call mom tomorrow at 7pm" → `SELECT * FROM nudge_schedules WHERE cancelled = false;`
- ✅ **Goal**: "I want to ship Aura v1 by August, that's my main short-term goal" → `SELECT * FROM goals WHERE status = 'active';`
- ✅ **Draft**: "draft a text to maya saying happy birthday" → Aura returns a draft.
- ✅ **Recap**: "what do you know about maya" → memory recap.
- ✅ **Hard convo**: "I need to break up with rachel" → Aura returns 3 message flavors.

---

## 10. Group chat (3 min) — OPTIONAL

If you want Aura in a group iMessage:

- ✅ Add Aura's Photon line to the group on your phone.
- ✅ Register the group:
  ```bash
  curl -X POST http://localhost:3001/internal/groups \
    -H "Authorization: Bearer $INTERNAL_API_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"externalId":"<photon space id>","ownerId":"<your user id>","name":"Squad","responsePolicy":"address_only"}'
  ```
- ✅ Add participants:
  ```bash
  curl -X POST http://localhost:3001/internal/groups/<groupId>/participants \
    -H "Authorization: Bearer $INTERNAL_API_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"externalHandle":"+15551234567","displayName":"Maya","role":"member"}'
  ```

The response policy options:
- `address_only` (default): reply only when @mentioned or name-prefixed
- `implicit_call`: also reply to coordination questions, max once per 10 messages
- `quiet`: only @mentions
- `host`: Aura is active host — replies liberally

**Note**: the conversation worker's final wire-up for group inbound (detecting a group vs 1:1 from Photon's `space` object) is **Sprint 11** — Photon's exact group API needs verification. The router, schema, routes, and address classifier are all ready.

---

## 11. Voice mode (5-10 min) — OPTIONAL

Sprint 10 ships the skeleton. Production wiring requires Twilio + (optionally) ElevenLabs.

- ✅ Twilio account + voice-capable phone number (twilio.com).
- ✅ Add to `.env`:
  ```
  TWILIO_ACCOUNT_SID=<from twilio dashboard>
  TWILIO_AUTH_TOKEN=<from twilio dashboard>
  TWILIO_VOICE_NUMBER=+1xxxxxxxxxx
  PUBLIC_BASE_URL=https://your-conversation-host.example.com
  ```
- ✅ In Twilio Console → Phone Numbers → your number → Voice → "A CALL COMES IN":
  - Set webhook to: `${PUBLIC_BASE_URL}/voice/incoming`
  - Method: POST
- ✅ (Optional, better voice) ElevenLabs account + voice ID:
  ```
  ELEVENLABS_API_KEY=<from elevenlabs.io>
  ELEVENLABS_VOICE_ID=<voice ID from your library>
  ```
  Without ElevenLabs, voice replies use Twilio's built-in Polly voice (worse but free).
- ✅ Verify: `curl ${PUBLIC_BASE_URL}/voice/health` → `{"ok":true,"enabled":true,...}`
- ✅ Call your Twilio number — Aura answers, gathers your speech, replies.

**Known limitation (v1)**: ElevenLabs is wired but not yet hooked into the TwiML response — it requires hosting the rendered audio file at a URL Twilio can `<Play>`. Sprint 11 will add that S3/R2 caching path.

---

## 12. (For me to track) Production deployment notes

Not strictly user-action items, but worth knowing:

- **DB connection**: use `DATABASE_URL` (pooled) in `app.use()`; reserve `DIRECT_URL` for migrations.
- **Encryption**: `KMS_ROOT_KEY` must be identical across all instances and backups. Use a managed secret store (AWS Secrets Manager, Doppler, etc.) — never check it into source.
- **Inngest signing**: in production, `INNGEST_SIGNING_KEY` must match what the Inngest dashboard generated.
- **Memory decay**: weekly job is idempotent. Safe to run on any cadence ≤ weekly.
- **Memory access log**: grows fast. Add a 90-day retention sweep when traffic ramps.
- **Composio scopes**: start narrow (readonly metadata for email). Body access opt-in per user.
- **Voice number costs**: Twilio voice ~$0.013/min inbound + Polly TTS ~$4/1M chars. ElevenLabs ~$0.30/1K chars. Budget accordingly.

---

---

## 13. Web settings UI (1-2 min) — OPTIONAL

Sprint 12 ships a real settings dashboard at `/settings` with phone+OTP auth.

- ✅ Add to `.env`: `AUTH_SECRET=<openssl rand -hex 32>` (or reuse `INTERNAL_API_SECRET` — the code falls back to it).
- ✅ Start the web app: `npm run web:dev`. Open `http://localhost:3000/settings`.
- ✅ Sign in: enter your phone (E.164 like `+15551234567`) → Aura sends you a 6-digit code via iMessage → enter it → you're in.
- ✅ 5 pages available:
  - `/settings` — dashboard with counts
  - `/settings/memories` — browse + delete individual memories
  - `/settings/integrations` — list integrations, revoke individual ones
  - `/settings/goals` — active / done / paused goals
  - `/settings/audit` — every memory access (who pulled what, when)
  - `/settings/danger` — export everything as JSON, delete account
- ✅ Logout via the header button.

The web app uses Next.js middleware to redirect unauthenticated requests to `/settings/login`. Session is an HTTP-only 30-day cookie signed with `AUTH_SECRET`.

**Production deployment note**: set `NODE_ENV=production` so cookies are issued with `Secure` flag. Make sure your domain has TLS.

---

## 14. Sprint 12 features (no extra setup)

Everything else in Sprint 12 works against the existing API + Inngest setup:

- **`spawn_agent` action** — Aura recognizes "plan my friend's birthday" / "should I take the job" / "hold me accountable for X" and dispatches to a specialist (planner / researcher / drafter / scheduler / advisor / coach / deal_finder). User sees "ok let me think on this, give me 8s" and then the specialist replies via the standard send pipeline.
- **`errand` action** — "book me a haircut" / "i need groceries" → Aura confirms the request, asks one clarifying question, offers to draft the actual booking. The booking-execution layer (Booksy/Instacart/Lyft via Composio) is wired but doesn't auto-execute yet — Aura returns the structured plan.
- **Predictive forecast** (daily 2am UTC) — looks at the last 30 days of sleep + workouts + screen time + tomorrow's calendar, asks gpt-5.4 to forecast risks (low energy / social isolation / doom scroll / routine skip). Pre-schedules a nudge for tomorrow if any risk crosses 0.65. Feels prescient when right.
- **Cross-Aura handshake** infrastructure — `services/auraHandshake.ts` ships the delegation grant + schedule-decide logic. Group-chat wire-up will use it once Photon's group API surface is verified (Sprint 13+).

---

## What's left for Sprint 13+

- **iOS Shortcut bundle authoring** (binary .shortcut files — needs Apple Shortcuts.app on Mac/iPhone)
- **Photon group-detection** in `apps/conversation/src/spectrum.ts` (final wire-up needs Photon SDK group API verification)
- **ElevenLabs `<Play>` hosting** for voice mode (S3/R2 cache → URL → TwiML)
- **Travel co-pilot** (flight search via Composio + price tracking)
- **Dating coach** (tone-mirror drafts for Hinge/Tinder via paste-in)
- **Photo "on this day"** + multimodal memory (Vision API for forwarded screenshots, Whisper for voice notes inbound)
- **Cross-Aura coordination** (the Aura-to-Aura moonshot — your Aura speaking for you in a group with opt-in delegation)
- **Predictive interventions** (forecast tomorrow's user state from 30 days of signals)

---

## Tests + counts

| Sprint | Conv tests | API tests |
|---|---|---|
| After 1 | 65 | 14 |
| After 2 | 64 | 20 |
| After 3 | 64 | 33 |
| After 4 | 71 | 39 |
| After 5 | 79 | 39 |
| After 6 | 79 | 39 |
| After 7 | 86 | 42 |
| After 8 | 86 | 42 |
| After 9 | 86 | 42 |
| **After 10** | **86** | **42** |

128 tests across both apps. Both apps typecheck clean.

---

## Troubleshooting

**Prisma migration fails with "type vector does not exist"** → re-do step 4.

**Tests fail with "OPENAI_API_KEY required"** → check `npm test` runs with `NODE_ENV=test` (set automatically in package.json).

**Aura replies as one long message** → check `apps/conversation/src/spectrum.ts` iterates over bursts. If only the first arrives, your Photon line may be rate-limiting — bump `burstDelayMs()` from 300-800ms to 800-1500ms.

**Memory extraction never runs** → confirm `inngest dev` is active. Check `inngest dev` output for "memory-extract" registration.

**"Composio SDK not installed"** → step 7's `npm install @composio/core`.

**Decryption errors after backup restore** → `KMS_ROOT_KEY` must match the one used to write the data. Step 2 says back it up — this is why.

**Voice mode 503** → step 11's env vars must all be set. Hit `/voice/health` to verify.

**Goal review never fires** → cron is Fri 6pm UTC. To test now: `curl -X POST $INNGEST_DEV/e/aura_test -H "Content-Type: application/json" -d '{"name":"aura/agent.goal_review_user","data":{"userId":"YOUR_USER_ID"}}'` (assuming Inngest dev server).
