-- Aura Sprint 5: group chat support.

-- group_spaces
CREATE TABLE IF NOT EXISTS "group_spaces" (
  "id"               TEXT PRIMARY KEY,
  "external_id"      TEXT NOT NULL UNIQUE,
  "name"             TEXT,
  "owner_id"         TEXT NOT NULL,
  "vibe"             TEXT,
  "response_policy"  TEXT NOT NULL DEFAULT 'address_only',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_spaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "group_spaces_owner_id_idx" ON "group_spaces"("owner_id");

-- group_participants
CREATE TABLE IF NOT EXISTS "group_participants" (
  "id"              TEXT PRIMARY KEY,
  "group_space_id"  TEXT NOT NULL,
  "user_id"         TEXT,
  "external_handle" TEXT NOT NULL,
  "display_name"    TEXT NOT NULL,
  "role"            TEXT NOT NULL DEFAULT 'member',
  "silenced"        BOOLEAN NOT NULL DEFAULT false,
  "added_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_participants_group_space_id_fkey" FOREIGN KEY ("group_space_id") REFERENCES "group_spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "group_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "group_participants_group_space_id_external_handle_key"
  ON "group_participants"("group_space_id", "external_handle");
CREATE INDEX IF NOT EXISTS "group_participants_user_id_idx" ON "group_participants"("user_id");

-- group_memories
CREATE TABLE IF NOT EXISTS "group_memories" (
  "id"             TEXT PRIMARY KEY,
  "group_space_id" TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "content"        TEXT NOT NULL,
  "importance"     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_memories_group_space_id_fkey" FOREIGN KEY ("group_space_id") REFERENCES "group_spaces"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "group_memories_group_space_id_importance_idx" ON "group_memories"("group_space_id", "importance" DESC);

-- messages: add group fields
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "group_space_id"        TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "author_participant_id" TEXT;
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_group_space_id_fkey"
    FOREIGN KEY ("group_space_id") REFERENCES "group_spaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_author_participant_id_fkey"
    FOREIGN KEY ("author_participant_id") REFERENCES "group_participants"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "messages_group_space_id_created_at_idx" ON "messages"("group_space_id", "created_at" DESC);
