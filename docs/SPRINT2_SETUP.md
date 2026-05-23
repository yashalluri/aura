# Sprint 2 setup — persistent memory + knowledge graph

Sprint 2 added Postgres-backed conversation history, semantic memories with
embeddings, and a knowledge graph. Before deploying you need to:

## 1. Enable pgvector in Supabase

Open your Supabase project → **Database → Extensions** and enable `vector`.

Or via SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is required — the `memories` and `entities` tables use the `vector(1536)`
column type to store embeddings.

## 2. Apply the migration

From the repo root:

```bash
npm install
npx prisma generate --schema=apps/api/prisma/schema.prisma
npm run db:migrate --workspace apps/api    # uses DIRECT_URL
```

This creates:
- `messages` — persistent conversation history (replaces the old 4-hour Map)
- `memories` — semantic memories with embeddings, importance, confidence, decay
- `entities` — knowledge-graph nodes (people, places, projects, topics, etc.)
- `relations` — weighted edges between entities

It also creates an IVFFlat index on each embedding column for fast cosine
similarity queries.

## 3. Environment variables

The only **new required** env var is `OPENAI_API_KEY` in `apps/api` (it was
already required in `apps/conversation`). Same key in both apps.

Used by:
- `apps/conversation` — chat replies (gpt-5.4-mini / gpt-5.4)
- `apps/api` — text embeddings (text-embedding-3-small) + memory extraction
  (gpt-5.4-mini via Inngest)

Update your `.env` from `.env.example`.

## 4. Confirm the OpenAI model names

Sprint 1 + Sprint 2 use these model names from May 2026 research:

- `gpt-5.4-mini` — default chat, default memory extraction
- `gpt-5.4` — affect-detected escalation
- `gpt-5.4-nano` — (reserved for safety classification in later sprints)
- `text-embedding-3-small` — embeddings (1536 dims)

If OpenAI's actual catalog uses different names, the API will return 404.
**Verify against your live OpenAI account before deploying.** Easy
substitutions if needed:
- `gpt-5.4-mini` → `gpt-4o-mini` (similar tier, currently $0.15/$0.60 per 1M)
- `gpt-5.4` → `gpt-4o` (similar tier)
- `text-embedding-3-small` → unchanged (this one's well-established)

Edit the constants in:
- `apps/conversation/src/llm/aura.ts` — `MODEL_CHAT` / `MODEL_HARD`
- `apps/api/src/inngest/functions/memoryExtract.ts` — `MODEL`
- `apps/api/src/lib/embeddings.ts` — `EMBEDDING_MODEL`

## 5. Inngest

Memory extraction runs on the existing Inngest setup. The two new functions
are auto-registered in `apps/api/src/inngest/functions/index.ts`:

- `memory-extract` — fires on `aura/memory.extract` event (sent after every
  user message persists)
- `memory-decay` — weekly cron, Sunday 4am UTC, reduces importance of
  long-untouched memories

Local dev: run `npx inngest-cli dev` as before. Production: register the
new functions in the Inngest dashboard.

## 6. Smoke test

After applying the migration:

```bash
# Generate Prisma client
npx prisma generate --schema=apps/api/prisma/schema.prisma

# Run all tests
npm run conversation:test
npm run api:test

# Start api + conversation
npm run api:dev          # in one terminal
npm run conversation:dev # in another

# In a third terminal, send a message via Spectrum (or curl the API)
# Verify:
#  - the message appears in `messages` table
#  - a few turns later, rows appear in `memories` table
#  - retrieving memories for a relevant query returns them
```

Quick SQL checks:

```sql
-- Newest 10 messages
SELECT id, role, LEFT(content, 80), created_at FROM messages ORDER BY created_at DESC LIMIT 10;

-- All memories for a user
SELECT id, kind, content, importance, source FROM memories WHERE user_id = '<USER_ID>' ORDER BY created_at DESC;

-- Check pgvector index is being used
EXPLAIN ANALYZE SELECT id, 1 - (embedding <=> '[0,0,0,...]'::vector) AS similarity
FROM memories WHERE user_id = '<USER_ID>'
ORDER BY embedding <=> '[0,0,0,...]'::vector LIMIT 8;
-- Should show "Index Scan using memories_embedding_idx"
```

## What you don't need yet

- Composio API key — Sprint 3
- Apple Calendar / Contacts / Health Shortcuts — Sprint 3
- Encryption keys — Sprint 4 (privacy)
- Group chat config — Sprint 5
