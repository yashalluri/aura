-- Aura Sprint 13: cross-Aura delegation table.

CREATE TABLE IF NOT EXISTS "aura_delegations" (
  "id"              TEXT PRIMARY KEY,
  "granter_user_id" TEXT NOT NULL,
  "group_space_id"  TEXT NOT NULL,
  "scope"           TEXT NOT NULL,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  "revoked_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "aura_delegations_granter_group_idx" ON "aura_delegations"("granter_user_id", "group_space_id");
CREATE INDEX IF NOT EXISTS "aura_delegations_expires_idx" ON "aura_delegations"("expires_at");
