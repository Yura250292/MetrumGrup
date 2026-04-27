-- Phase 1.F: KB-2в, KB-3, RetentionRecord. Pure additive — no existing data
-- changed except a Project.retentionPercent column with default 0.

-- Enums
DO $$ BEGIN
  CREATE TYPE "KB2Status" AS ENUM ('DRAFT', 'ISSUED', 'SIGNED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "KB3Status" AS ENUM ('DRAFT', 'ISSUED', 'SIGNED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetentionStatus" AS ENUM ('HELD', 'RELEASED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- projects: retentionPercent default
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "retentionPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0;

-- kb2_forms
CREATE TABLE IF NOT EXISTS "kb2_forms" (
  "id"               TEXT NOT NULL,
  "projectId"        TEXT NOT NULL,
  "estimateId"       TEXT,
  "counterpartyId"   TEXT,
  "number"           TEXT NOT NULL,
  "periodFrom"       TIMESTAMP(3) NOT NULL,
  "periodTo"         TIMESTAMP(3) NOT NULL,
  "totalAmount"      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "retentionPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "retentionAmount"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "netPayable"       DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "status"           "KB2Status" NOT NULL DEFAULT 'DRAFT',
  "notes"            TEXT,
  "pdfR2Key"         TEXT,
  "issuedAt"         TIMESTAMP(3),
  "signedAt"         TIMESTAMP(3),
  "cancelledAt"      TIMESTAMP(3),
  "approvedById"     TEXT,
  "financeEntryId"   TEXT,
  "kb3FormId"        TEXT,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kb2_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kb2_forms_number_key"          ON "kb2_forms"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "kb2_forms_financeEntryId_key"  ON "kb2_forms"("financeEntryId");
CREATE INDEX        IF NOT EXISTS "kb2_forms_projectId_periodTo_idx" ON "kb2_forms"("projectId", "periodTo");
CREATE INDEX        IF NOT EXISTS "kb2_forms_counterpartyId_idx"  ON "kb2_forms"("counterpartyId");
CREATE INDEX        IF NOT EXISTS "kb2_forms_status_idx"          ON "kb2_forms"("status");
CREATE INDEX        IF NOT EXISTS "kb2_forms_kb3FormId_idx"       ON "kb2_forms"("kb3FormId");

-- kb2_form_items
CREATE TABLE IF NOT EXISTS "kb2_form_items" (
  "id"                TEXT NOT NULL,
  "formId"            TEXT NOT NULL,
  "estimateItemId"    TEXT,
  "description"       TEXT NOT NULL,
  "unit"              TEXT NOT NULL,
  "totalQty"          DECIMAL(12, 3) NOT NULL,
  "unitPrice"         DECIMAL(12, 2) NOT NULL,
  "completedQty"      DECIMAL(12, 3) NOT NULL,
  "amount"            DECIMAL(14, 2) NOT NULL,
  "completionPercent" DECIMAL(5, 2),
  "costCodeId"        TEXT,
  "costType"          "CostType",
  "sortOrder"         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "kb2_form_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kb2_form_items_formId_sortOrder_idx" ON "kb2_form_items"("formId", "sortOrder");
CREATE INDEX IF NOT EXISTS "kb2_form_items_estimateItemId_idx"   ON "kb2_form_items"("estimateItemId");

-- kb3_forms
CREATE TABLE IF NOT EXISTS "kb3_forms" (
  "id"             TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "counterpartyId" TEXT,
  "number"         TEXT NOT NULL,
  "periodFrom"     TIMESTAMP(3) NOT NULL,
  "periodTo"       TIMESTAMP(3) NOT NULL,
  "totalAmount"    DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "status"         "KB3Status" NOT NULL DEFAULT 'DRAFT',
  "notes"          TEXT,
  "pdfR2Key"       TEXT,
  "issuedAt"       TIMESTAMP(3),
  "signedAt"       TIMESTAMP(3),
  "approvedById"   TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kb3_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kb3_forms_number_key"          ON "kb3_forms"("number");
CREATE INDEX        IF NOT EXISTS "kb3_forms_projectId_periodTo_idx" ON "kb3_forms"("projectId", "periodTo");
CREATE INDEX        IF NOT EXISTS "kb3_forms_status_idx"          ON "kb3_forms"("status");

-- retention_records
CREATE TABLE IF NOT EXISTS "retention_records" (
  "id"                     TEXT NOT NULL,
  "kb2FormId"              TEXT NOT NULL,
  "amount"                 DECIMAL(14, 2) NOT NULL,
  "releaseDate"            TIMESTAMP(3) NOT NULL,
  "releasedAt"             TIMESTAMP(3),
  "releasedFinanceEntryId" TEXT,
  "status"                 "RetentionStatus" NOT NULL DEFAULT 'HELD',
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "retention_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "retention_records_releasedFinanceEntryId_key" ON "retention_records"("releasedFinanceEntryId");
CREATE INDEX        IF NOT EXISTS "retention_records_kb2FormId_idx"               ON "retention_records"("kb2FormId");
CREATE INDEX        IF NOT EXISTS "retention_records_status_releaseDate_idx"      ON "retention_records"("status", "releaseDate");

-- FKs (idempotent, all SET NULL where appropriate)
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_estimateId_fkey"
    FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_financeEntryId_fkey"
    FOREIGN KEY ("financeEntryId") REFERENCES "finance_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_kb3FormId_fkey"
    FOREIGN KEY ("kb3FormId") REFERENCES "kb3_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_forms" ADD CONSTRAINT "kb2_forms_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "kb2_form_items" ADD CONSTRAINT "kb2_form_items_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "kb2_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_form_items" ADD CONSTRAINT "kb2_form_items_estimateItemId_fkey"
    FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb2_form_items" ADD CONSTRAINT "kb2_form_items_costCodeId_fkey"
    FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "kb3_forms" ADD CONSTRAINT "kb3_forms_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb3_forms" ADD CONSTRAINT "kb3_forms_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb3_forms" ADD CONSTRAINT "kb3_forms_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "kb3_forms" ADD CONSTRAINT "kb3_forms_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "retention_records" ADD CONSTRAINT "retention_records_kb2FormId_fkey"
    FOREIGN KEY ("kb2FormId") REFERENCES "kb2_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "retention_records" ADD CONSTRAINT "retention_records_releasedFinanceEntryId_fkey"
    FOREIGN KEY ("releasedFinanceEntryId") REFERENCES "finance_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
