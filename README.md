# Aura

> Your AI best friend + life assistant, in one text thread.

Aura is a **text-first AI best friend** for Gen Z / Gen Alpha / younger Millennials. It's the friend you can always text — and the quiet assistant that keeps your relationships, routines, body, and headspace on track. Local-first, no dashboards, no corporate-bot energy.

Folk runs your work and tools. **Aura runs you.**

---

## What Aura does

1. **Friend** — text it like a close friend, any time. It listens, reflects, and talks in your vibe.
2. **Life assistant** — reminds you to text the people who matter, keeps your small routines (gym, sleep, reading) on track, helps you shape your day.
3. **Privacy guardian** — built local-first. Your inner life and relationship graph stay on your device as much as possible.

## What Aura is *not* (yet)

- Not a work agent (no GitHub / Jira / Notion).
- Not a therapist or medical product.
- Not a dashboard-heavy productivity tool.

---

## Repo layout

This is an npm-workspaces monorepo.

```
aura/
├── apps/
│   ├── api/        # Backend: Fastify + TS + Prisma + Postgres. REST API + daily scheduler.
│   ├── sms/        # Twilio inbound webhook + morning cron + LLM persona.
│   └── web/        # Next.js + Tailwind marketing site (folk.app-style).
└── packages/
    └── shared/     # Shared TS types (Contact, Routine, DailySuggestion, etc.)
```

Each app has its own README with setup steps.

---

## Roadmap

The full product spec lives in the project plan. The build is staged:

- **Phase 0 — Scaffold** ✅ — repo created, monorepo laid out, this README.
- **Phase 1 — Backend** — data model, REST API, daily-suggestion scheduler.
- **Phase 2 — SMS layer** — Twilio webhook, command router, morning cron, Aura LLM persona.
- **Phase 3 — Marketing site** — Next.js landing page with chat preview + email capture.
- **Phase 4 — Voice & safety polish** — tone modes (`neutral` / `millennial` / `gen_z`), style mirroring, safety guardrails.

Post-v1: deeper calendar integration, Apple Health / Google Fit, on-device LLM for full local mode.

---

## Quickstart

```bash
git clone https://github.com/yashalluri/aura.git
cd aura
npm install
```

Per-app dev instructions live in each app's README (coming with each phase).

---

## Voice & tone

Aura talks like a real friend in iMessage — warm, short, slightly playful, never corporate. It mirrors the user's style (slang, emojis, capitalization) and can switch tone modes. It encourages real-world connection rather than replacing it.

## Privacy

The long-term direction is on-device LLM + local embedding store. The server only stores what's required for scheduling and SMS delivery.

---

## License

TBD.
