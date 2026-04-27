-- Phase 1.A2: link FinanceEntry / FinanceExpenseTemplate to Counterparty by FK,
-- and extend Counterparty with dossier fields (edrpou, iban, vatPayer).
-- Pure additive — existing `counterparty` string columns stay as denormalised cache.

-- counterparties: dossier fields
ALTER TABLE "counterparties"
  ADD COLUMN IF NOT EXISTS "edrpou"   TEXT,
  ADD COLUMN IF NOT EXISTS "iban"     TEXT,
  ADD COLUMN IF NOT EXISTS "vatPayer" BOOLEAN NOT NULL DEFAULT false;

-- finance_entries: counterpartyId FK
ALTER TABLE "finance_entries"
  ADD COLUMN IF NOT EXISTS "counterpartyId" TEXT;

CREATE INDEX IF NOT EXISTS "finance_entries_counterpartyId_idx" ON "finance_entries"("counterpartyId");

DO $$ BEGIN
  ALTER TABLE "finance_entries"
    ADD CONSTRAINT "finance_entries_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- finance_expense_templates: counterpartyId FK
ALTER TABLE "finance_expense_templates"
  ADD COLUMN IF NOT EXISTS "counterpartyId" TEXT;

CREATE INDEX IF NOT EXISTS "finance_expense_templates_counterpartyId_idx" ON "finance_expense_templates"("counterpartyId");

DO $$ BEGIN
  ALTER TABLE "finance_expense_templates"
    ADD CONSTRAINT "finance_expense_templates_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
