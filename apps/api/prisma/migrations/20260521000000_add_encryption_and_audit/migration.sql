-- Aura Sprint 4: encryption + audit log.

-- Add per-user encryption key (encrypted with KMS_ROOT_KEY at write time).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "enc_key" TEXT;

-- Memory access audit log.
CREATE TABLE IF NOT EXISTS "memory_accesses" (
  "id"          TEXT PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "memory_id"   TEXT NOT NULL,
  "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor"       TEXT NOT NULL,
  "context"     TEXT,
  CONSTRAINT "memory_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "memory_accesses_user_id_accessed_at_idx" ON "memory_accesses"("user_id", "accessed_at" DESC);
CREATE INDEX IF NOT EXISTS "memory_accesses_memory_id_idx" ON "memory_accesses"("memory_id");
