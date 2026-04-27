-- Phase 1.C1: Timesheet (daily labor record). Pure additive — no existing
-- tables modified except Employee (burdenMultiplier nullable column).

-- employees: burdenMultiplier
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "burdenMultiplier" DECIMAL(5, 3);

-- timesheets table
CREATE TABLE IF NOT EXISTS "timesheets" (
  "id"             TEXT NOT NULL,
  "employeeId"     TEXT,
  "workerId"       TEXT,
  "projectId"      TEXT NOT NULL,
  "costCodeId"     TEXT,
  "costType"       "CostType",
  "date"           DATE NOT NULL,
  "hours"          DECIMAL(5, 2) NOT NULL,
  "hourlyRate"     DECIMAL(10, 2) NOT NULL,
  "amount"         DECIMAL(12, 2) NOT NULL,
  "notes"          TEXT,
  "approvedAt"     TIMESTAMP(3),
  "approvedById"   TEXT,
  "financeEntryId" TEXT,
  "createdById"    TEXT NOT NULL,
  "updatedById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "timesheets_financeEntryId_key" ON "timesheets"("financeEntryId");
CREATE INDEX IF NOT EXISTS "timesheets_projectId_date_idx"  ON "timesheets"("projectId", "date");
CREATE INDEX IF NOT EXISTS "timesheets_employeeId_date_idx" ON "timesheets"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "timesheets_workerId_date_idx"   ON "timesheets"("workerId", "date");
CREATE INDEX IF NOT EXISTS "timesheets_costCodeId_idx"      ON "timesheets"("costCodeId");
CREATE INDEX IF NOT EXISTS "timesheets_approvedAt_idx"      ON "timesheets"("approvedAt");

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_costCodeId_fkey"
    FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_financeEntryId_fkey"
    FOREIGN KEY ("financeEntryId") REFERENCES "finance_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- App-level constraint: exactly one of (employeeId, workerId). Enforced via Zod
-- in /api/admin/timesheets/* routes; we keep DB lenient to avoid migration issues
-- with legacy data and mass-imports.
