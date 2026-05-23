# Aura's privacy model

## The promise

> Aura processes your signals in the moment and forgets the raw data — it only
> keeps what it learns about you, encrypted, and you can see and delete all
> of it anytime.

This is the honest version of "your data stays local." True device-local
storage is incompatible with the always-on agents that make Aura useful — for
an agent to act on "you've been on Instagram 30 min, get off," the signal has
to reach the server. What we promise instead: **minimize, encrypt, transparent.**

## The architecture

### 1. Encrypt at rest

Every sensitive column on every user-scoped table is encrypted with a
per-user AES-256-GCM key. That key is itself encrypted under `KMS_ROOT_KEY`
(envelope encryption — see `apps/api/src/lib/crypto.ts`). A DB-only compromise
(SQL injection, backup leak, read-only access) yields ciphertext.

**Currently encrypted at rest:**
- `Memory.content` — every fact Aura has extracted about you
- `Message.content` — every conversation turn (Phase 3). Decrypted in-memory
  on each context load; existing pre-Phase-3 rows were re-encrypted via
  `scripts/backfill-message-encryption.ts`.
- (Future) `signal_events.payload` (Phase 4) — raw integration data while
  in transit through processing

**Not encrypted (intentional, low sensitivity):**
- User profile fields (phone number, timezone, name, etc.)
- Contact + routine + entity *metadata* (names, frequencies) — the *content*
  of memories about them IS encrypted

**Known plaintext channels (Phase 3 limitation):**
- **API + conversation worker logs.** When an inbound iMessage arrives the
  conversation worker logs `{from, text}` for debugging. Server logs are a
  plaintext channel for the duration of the log retention window. Production
  should either redact `text` field or ship logs to a separate encrypted
  store. Not blocking development; flagging for production.
- **Request/response bodies** flowing between conversation worker and API.
  Both services hold the encryption material, so intra-cluster traffic is
  trusted. Don't proxy these requests through a third party.

**Not defended against:**
- API host compromise — the process holds the root key. If the server itself
  is owned, an attacker can read everything. The path to client-key zero-
  knowledge (server holds *encrypted-with-passkey* user keys) is documented
  here and is a Phase 4+ stretch.

### 2. Minimize what's persisted

Raw integration signals (calendar events, screen-time sessions, health
samples, mail snippets) are processed **transiently in-memory** by the
relevant signal agent. The agent extracts **derived facts** as `Memory` rows
("user tends to doomscroll evenings", "slept poorly Tuesday") — those persist
encrypted. The raw firehose does NOT persist long-term.

(Phase 1 ships the memory layer; Phase 4 ships the integrations + this
retention policy. Until Phase 4, signal_events doesn't exist yet.)

**Retention policy (Phase 4+):**
- `signal_events` rows auto-purged 7 days after creation by a daily Inngest job
- Derived `Memory` rows persist indefinitely unless the user deletes them or
  they decay below importance 0.1 (then auto-archived after 30 days unrecalled)

### 3. Transparent — you see and control everything

Every memory access (the LLM pulling a fact into a prompt, an agent reading
your state) writes a row to `memory_accesses`:

```sql
SELECT memory_id, actor, context, accessed_at
FROM memory_accesses
WHERE user_id = '<your-id>'
ORDER BY accessed_at DESC;
```

The Phase 5 web app surfaces this as the **3D memory graph** — every node
in the graph is something Aura knows about you, click to see when/why it
was accessed, "forget this" to delete (7-day undo grace).

### 4. Opt-in granularity

Every Composio integration (Phase 4) is separately opt-in. Sensitive scopes
require explicit per-flow opt-in:
- Gmail body access requires `PATCH /users/:id/integrations/icloud_mail` with
  `{ "settings": { "bodyOptIn": true } }`. Default = metadata-only (sender +
  subject + received-at + first 200 chars).
- Apple Notes only ingests notes tagged `#aura`. Untagged notes never leave
  the device.
- Apple Photos sends metadata only (date, location, face-cluster names) —
  raw image bytes never reach the server.

## What you can do as a user (Phase 5+)

- **See it**: log into the 3D memory graph at `/you`, every fact Aura knows
  is a node.
- **Edit it**: click any fact → side panel → edit or delete.
- **Export it**: `/settings/export` → encrypted JSON dump of everything Aura
  has on you (Phase 5+).
- **Wipe it**: `/settings/delete` → full account hard-delete with 7-day grace
  window.
- **Revoke an integration**: `/settings/integrations/:app/revoke` → immediate
  disconnect, 7-day grace before related memories soft-delete.

## What we do as operators

- Run the encryption pipeline in the conversation worker, in-memory only,
  for one prompt at a time. Plaintext is never logged.
- Never log message content, memory content, or signal payloads. Logs
  contain user IDs + event types only.
- Per-integration scope minimization on every Composio app.
- `KMS_ROOT_KEY` lives in environment, never in the DB, never in logs.

## What you should know

This is **server-side encrypted, transient processing, transparent recall**.
It is not zero-knowledge. The server can decrypt your memories during normal
operation. If you need a stronger threat model (e.g. journaling about
sensitive topics that even the server shouldn't read), the planned client-
held-key vault (Phase 4+ stretch) is the path. Until then, the recommendation
is: don't tell Aura anything you wouldn't tell a trusted friend who you're
also paying $5/mo for the privilege.
