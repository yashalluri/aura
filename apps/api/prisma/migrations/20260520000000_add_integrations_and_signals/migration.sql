-- Aura Sprint 3: integrations + signal events.

-- ── integration_connections ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id"                     TEXT PRIMARY KEY,
  "user_id"                TEXT NOT NULL,
  "app"                    TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'active',
  "scopes"                 TEXT[] NOT NULL DEFAULT '{}',
  "composio_connection_id" TEXT,
  "webhook_token"          TEXT UNIQUE,
  "connected_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sync_at"           TIMESTAMP(3),
  "settings"               JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "integration_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_user_id_app_key" ON "integration_connections"("user_id", "app");

-- ── signal_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "signal_events" (
  "id"          TEXT PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "summary"     TEXT NOT NULL,
  "payload"     JSONB NOT NULL DEFAULT '{}',
  "ingested"    BOOLEAN NOT NULL DEFAULT false,
  "ingest_err"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signal_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "signal_events_user_id_occurred_at_idx" ON "signal_events"("user_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "signal_events_user_id_source_idx" ON "signal_events"("user_id", "source");
CREATE INDEX IF NOT EXISTS "signal_events_user_id_ingested_idx" ON "signal_events"("user_id", "ingested");
