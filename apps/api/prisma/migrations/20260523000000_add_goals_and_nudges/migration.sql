-- Aura Sprint 7: goals + reminders.

DO $$ BEGIN
  CREATE TYPE "GoalKind" AS ENUM ('short', 'long');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GoalStatus" AS ENUM ('active', 'done', 'paused', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "goals" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL,
  "kind"       "GoalKind" NOT NULL,
  "parent_id"  TEXT,
  "title"      TEXT NOT NULL,
  "why"        TEXT,
  "deadline"   TIMESTAMP(3),
  "status"     "GoalStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "goals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "goals"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "goals_user_id_status_idx" ON "goals"("user_id", "status");
CREATE INDEX IF NOT EXISTS "goals_user_id_kind_status_idx" ON "goals"("user_id", "kind", "status");

CREATE TABLE IF NOT EXISTS "milestones" (
  "id"         TEXT PRIMARY KEY,
  "goal_id"    TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "done_at"    TIMESTAMP(3),
  "evidence"   JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "milestones_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "milestones_goal_id_done_at_idx" ON "milestones"("goal_id", "done_at");

CREATE TABLE IF NOT EXISTS "nudge_schedules" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL,
  "when"       TIMESTAMP(3) NOT NULL,
  "kind"       TEXT NOT NULL,
  "payload"    JSONB NOT NULL DEFAULT '{}',
  "sent_at"    TIMESTAMP(3),
  "cancelled"  BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nudge_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "nudge_schedules_when_sent_cancelled_idx" ON "nudge_schedules"("when", "sent_at", "cancelled");
CREATE INDEX IF NOT EXISTS "nudge_schedules_user_id_when_idx" ON "nudge_schedules"("user_id", "when");
