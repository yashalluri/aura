-- Aura Sprint 2: persistent memory + knowledge graph.
-- Adds Message (episodic), Memory (semantic w/ pgvector), Entity + Relation (knowledge graph).
--
-- Prereq: pgvector extension. Supabase has this available; we ensure it's enabled.

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── New enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MemoryKind" AS ENUM ('fact', 'preference', 'event', 'relationship', 'goal', 'value', 'pattern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EntityKind" AS ENUM ('person', 'place', 'project', 'topic', 'habit', 'media', 'org');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── messages (episodic memory) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "messages" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL,
  "role"       TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "channel"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "messages_user_id_created_at_idx" ON "messages"("user_id", "created_at" DESC);

-- ── memories (semantic memory w/ embeddings) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "memories" (
  "id"               TEXT PRIMARY KEY,
  "user_id"          TEXT NOT NULL,
  "kind"             "MemoryKind" NOT NULL,
  "content"          TEXT NOT NULL,
  "embedding"        vector(1536),
  "importance"       DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confidence"       DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "source"           TEXT NOT NULL,
  "attrs"            JSONB NOT NULL DEFAULT '{}',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_recalled_at" TIMESTAMP(3),
  "decayed_at"       TIMESTAMP(3),
  CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "memories_user_id_kind_idx" ON "memories"("user_id", "kind");
CREATE INDEX IF NOT EXISTS "memories_user_id_importance_idx" ON "memories"("user_id", "importance" DESC);

-- IVFFlat index for fast cosine similarity over embeddings.
-- `lists = 100` is a good default; tune up to sqrt(N) once we have data.
CREATE INDEX IF NOT EXISTS "memories_embedding_idx"
  ON "memories" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- ── entities (knowledge graph nodes) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entities" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL,
  "kind"       "EntityKind" NOT NULL,
  "canonical"  TEXT NOT NULL,
  "aliases"    TEXT[] NOT NULL DEFAULT '{}',
  "attrs"      JSONB NOT NULL DEFAULT '{}',
  "embedding"  vector(1536),
  "contact_id" TEXT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "entities_user_id_kind_idx" ON "entities"("user_id", "kind");
CREATE INDEX IF NOT EXISTS "entities_embedding_idx"
  ON "entities" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- ── relations (knowledge graph edges) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "relations" (
  "id"            TEXT PRIMARY KEY,
  "user_id"       TEXT NOT NULL,
  "from_id"       TEXT NOT NULL,
  "to_id"         TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "strength"      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "last_event_at" TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "relations_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "entities"("id") ON DELETE CASCADE,
  CONSTRAINT "relations_to_id_fkey"   FOREIGN KEY ("to_id")   REFERENCES "entities"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "relations_user_id_from_id_idx" ON "relations"("user_id", "from_id");
CREATE INDEX IF NOT EXISTS "relations_user_id_to_id_idx"   ON "relations"("user_id", "to_id");
