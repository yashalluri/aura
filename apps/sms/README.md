# @aura/sms

SMS gateway for Aura — handles inbound/outbound text messages via Twilio and generates conversational responses via OpenAI GPT-4o.

## Architecture

```
User's phone ↔ Twilio ↔ apps/sms (port 3002) ↔ apps/api (port 3001) ↔ Postgres
                                ↕
                           OpenAI GPT-4o
```

The SMS service **never touches the database directly** — it calls `apps/api` via internal HTTP endpoints.

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` at the repo root and fill in:

```
TWILIO_ACCOUNT_SID=ACe0...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
OPENAI_API_KEY=sk-...
INTERNAL_API_SECRET=<same secret as apps/api>
API_BASE_URL=http://localhost:3001
```

### 2. Install & run

```bash
# From repo root
npm install --include=dev

# Start the API first (needs DB)
npm run api:dev

# Start the SMS service
npm run sms:dev
```

### 3. Expose to Twilio (development)

Twilio needs a public URL to send webhook requests. Use ngrok:

```bash
ngrok http 3002
```

Then in the Twilio Console:
1. Go to **Phone Numbers → Manage → Active Numbers**
2. Click your number
3. Under **Messaging → A message comes in**, set:
   - Webhook: `https://<your-ngrok-url>/sms/webhook`
   - Method: POST

### 4. Test it

Text your Twilio number from your verified phone. Aura will respond!

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/sms/webhook` | Twilio inbound SMS webhook |

## How it works

### Inbound flow
1. User texts Twilio number
2. Twilio POSTs to `/sms/webhook` with `From` and `Body`
3. SMS service looks up (or creates) user via API
4. Fetches user's contacts + routines for context
5. Sends message + context to GPT-4o with Aura's persona prompt
6. GPT-4o may include a structured action (add contact, mark done, etc.)
7. Action is executed via API calls
8. Response is sent back as TwiML

### Tone modes
Aura adapts language based on user's `toneMode`:
- **gen_z**: lowercase, slang, emoji-heavy, bestie energy 💀✨
- **millennial**: casual but proper, some emoji, wholesome vibes
- **neutral**: clean, friendly, minimal emoji

### Conversation memory
- In-memory buffer: last 20 messages per phone number
- Expires after 4 hours of inactivity
- Resets on server restart (fine for v1)

## Tests

```bash
npm test --workspace apps/sms
```

24 unit tests covering:
- Conversation state management
- Action extraction from LLM responses
- Fuzzy matching for contact/routine names
