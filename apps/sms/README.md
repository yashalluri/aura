# @aura/sms

Twilio SMS layer for Aura.

**Stack:** Node + TypeScript + Fastify (webhook) + Twilio SDK + LLM SDK (Anthropic or OpenAI).

## Responsibilities

- **Inbound:** receive SMS via Twilio webhook, identify the user by `From`, route the message:
  - Commands (`add contact`, `add goal`, `done`, `checkin`, `help`) → call `@aura/api` endpoints.
  - Anything else → pass to the Aura LLM persona with the user's context.
- **Outbound morning cron:** for each user, fetch `/daily-checkin`, format a friendly text, send via Twilio.

## Status

🚧 Phase 2 — not yet implemented.

## Setup (planned)

```bash
cd apps/sms
npm install
# Set TWILIO_* + ANTHROPIC_API_KEY (or OPENAI_API_KEY) in the root .env.
npm run dev
# Expose locally with ngrok and point the Twilio number's webhook at
# https://<your-ngrok>/sms/inbound
```

## Aura LLM persona

System prompt lives in `src/llm/aura.ts`. See product spec §9.
