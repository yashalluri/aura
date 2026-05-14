# @aura/api

Backend for Aura.

**Stack:** Node 20 + TypeScript + Fastify 4 + Prisma + Supabase Postgres + `node-cron` + Luxon.

## What it does

- REST API for users, contacts, routines, and the event log.
- Pure ranking function (`computeDailySuggestion`) that picks who to nudge today and which routines need a poke, per the spec §6.2.
- In-process cron that fires every 15 minutes and persists a per-user-per-local-day `DailySuggestion` snapshot for the SMS layer to read.

## Setup

### 1. Supabase connection strings

In Supabase: **Project Settings → Database → Connection string**.

- Copy the **Transaction pooler** URL (port `6543`) into `DATABASE_URL` and append `?pgbouncer=true&connection_limit=1` if it isn't already there.
- Copy the **Session / direct** URL (port `5432`) into `DIRECT_URL`.

Prisma needs both: pooled for runtime queries, direct for migrations.

### 2. Generate an internal API secret

```bash
openssl rand -hex 32
```

Paste into `INTERNAL_API_SECRET` in the root `.env`.

### 3. Install + migrate + seed

```bash
# from repo root
npm install
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Run

```bash
npm run dev --workspace apps/api
# Fastify listens on $API_PORT (default 3001).
```

## Project layout

```
src/
├── index.ts              # entry: server + cron
├── server.ts             # Fastify app factory
├── env.ts                # Zod-validated env
├── lib/                  # db, time (luxon), errors
├── middleware/           # internalAuth, loadUser
├── routes/               # one file per resource
├── scheduler/
│   ├── compute.ts        # pure ranking function
│   ├── runForUser.ts     # DB-aware: compute + persist snapshot
│   └── cron.ts           # */15 min, tz-aware
└── services/
    └── enumSync.ts       # guards drift between Prisma enums and @aura/shared
prisma/
├── schema.prisma
└── seed.ts               # demo user + 3 contacts + 2 routines
tests/
├── compute.test.ts
└── enumSync.test.ts
```

## Auth model

| Path             | Auth                                     |
| ---------------- | ---------------------------------------- |
| `GET /health`    | Public                                   |
| `/internal/*`    | `Authorization: Bearer ${INTERNAL_API_SECRET}` |
| `/debug/*`       | Same secret, only mounted when `NODE_ENV !== "production"` |

The Phase 2 SMS layer resolves `phoneNumber → userId` from the inbound Twilio webhook and calls `/internal/users/:userId/...` with the bearer secret.

## API surface

All `/internal/*` calls require the bearer header.

| Method | Path                                                | Body / params                                                       |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/health`                                           | —                                                                   |
| POST   | `/internal/users`                                   | `{ phoneNumber, timezone?, checkInHour?, toneMode? }` (upsert)      |
| GET    | `/internal/users/by-phone/:phone`                   | —                                                                   |
| GET    | `/internal/users/:userId`                           | —                                                                   |
| PATCH  | `/internal/users/:userId`                           | `{ timezone?, checkInHour?, toneMode? }`                            |
| GET    | `/internal/users/:userId/contacts`                  | —                                                                   |
| POST   | `/internal/users/:userId/contacts`                  | `{ name, relationshipType?, targetFrequencyDays, birthday? }`       |
| PATCH  | `/internal/contacts/:id`                            | partial                                                             |
| DELETE | `/internal/contacts/:id`                            | —                                                                   |
| GET    | `/internal/users/:userId/routines`                  | —                                                                   |
| POST   | `/internal/users/:userId/routines`                  | `{ name, frequencyType, frequencyValue }`                           |
| PATCH  | `/internal/routines/:id`                            | partial                                                             |
| DELETE | `/internal/routines/:id`                            | —                                                                   |
| POST   | `/internal/events/contact-checkin`                  | `{ contactId }`                                                     |
| POST   | `/internal/events/routine-done`                     | `{ routineId }`                                                     |
| GET    | `/internal/users/:userId/daily-checkin`             | computes + persists today's suggestion (idempotent)                 |
| GET    | `/internal/users/:userId/daily-checkin/today`       | returns the persisted snapshot only                                 |
| GET    | `/debug/daily-checkin?phone=+15555550100&persist=false` | dev convenience                                                 |

## Smoke test (with curl)

After `npm run dev` and `npx prisma db seed`:

```bash
SECRET="$INTERNAL_API_SECRET"   # or paste the value
H="Authorization: Bearer $SECRET"

# Seeded user has phone +15555550100
curl -s -H "$H" "http://localhost:3001/internal/users/by-phone/+15555550100" | jq

# Today's suggestion (computes + persists)
USER_ID=$(curl -s -H "$H" "http://localhost:3001/internal/users/by-phone/+15555550100" | jq -r .id)
curl -s -H "$H" "http://localhost:3001/internal/users/$USER_ID/daily-checkin" | jq

# Idempotency check: run twice, should return cached:true the second time
curl -s -H "$H" "http://localhost:3001/internal/users/$USER_ID/daily-checkin" | jq .cached

# Mark a contact checked in
CONTACT_ID=$(curl -s -H "$H" "http://localhost:3001/internal/users/$USER_ID/contacts" | jq -r '.[0].id')
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d "{\"contactId\":\"$CONTACT_ID\"}" \
  "http://localhost:3001/internal/events/contact-checkin" | jq
```

## Scheduler behavior

- Cron tick every 15 min: `*/15 * * * *`.
- For each user, compares `luxon.DateTime.now().setZone(user.timezone).hour` to `user.checkInHour`.
- On match, computes and persists `DailySuggestionRow { userId, localDate, payload }`.
- Unique constraint on `(userId, localDate)` makes the operation idempotent across restarts and DST edges.
- Phase 2 SMS cron reads these rows, sends the text, and sets `sentAt`.

## Testing

```bash
npm test --workspace apps/api
```

- `compute.test.ts` — 14 unit tests covering empty input, overdue ranking, birthday bump (within / beyond window), createdAt fallback, daily / weekly / custom routine logic, caps, and user-timezone date.
- `enumSync.test.ts` — asserts Prisma's generated enums match `@aura/shared` literal unions.

These run without a live DB.

## Common gotchas

- **`P1001` on `prisma migrate`** — your `DIRECT_URL` is wrong or the DB is paused. Check Supabase.
- **`prepared statement already exists`** — your `DATABASE_URL` is missing `?pgbouncer=true&connection_limit=1`.
- **Cron not firing in dev** — check `user.timezone` and `user.checkInHour`; use `/debug/daily-checkin` to bypass the time gate.
