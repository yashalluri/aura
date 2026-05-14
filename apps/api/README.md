# @aura/api

Backend for Aura.

**Stack:** Node + TypeScript + Fastify + Prisma + Postgres.

## Responsibilities

- REST API for users, contacts, routines, event log, and the daily check-in payload.
- Daily scheduler that computes which people are overdue for a check-in and which routines need a nudge.

## Status

🚧 Phase 1 — not yet implemented. See the root README roadmap.

## Planned routes

| Method | Path                            | Purpose                                |
| ------ | ------------------------------- | -------------------------------------- |
| POST   | `/users`                        | Create user                            |
| GET    | `/contacts`                     | List user's contacts                   |
| POST   | `/contacts`                     | Create contact                         |
| PATCH  | `/contacts/:id`                 | Update contact                         |
| GET    | `/routines`                     | List routines                          |
| POST   | `/routines`                     | Create routine                         |
| PATCH  | `/routines/:id`                 | Update routine                         |
| POST   | `/events/contact-checkin`       | Mark contact as checked in             |
| POST   | `/events/routine-done`          | Mark routine as done                   |
| GET    | `/daily-checkin`                | Today's `DailySuggestion` for the user |
| GET    | `/debug/daily-checkin`          | Same, for debugging                    |

## Data model (planned)

`User`, `Contact`, `Routine`, `EventLog` — see the product spec §6.1.

## Setup (planned)

```bash
cd apps/api
npm install
cp ../../.env.example ../../.env  # at repo root
npx prisma migrate dev
npm run dev          # starts Fastify
npm run scheduler    # runs the daily-suggestion job
```
