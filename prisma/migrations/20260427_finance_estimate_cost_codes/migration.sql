-- Phase 1.A1 step 2: add nullable cost-code axis to FinanceEntry and EstimateItem.
-- Pure additive — existing data is preserved untouched. Backfill is run separately
-- by scripts/backfill-cost-codes.ts.

-- finance_entries
ALTER TABLE "finance_entries"
  ADD COLUMN IF NOT EXISTS "costCodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "costType"   "CostType";

CREATE INDEX IF NOT EXISTS "finance_entries_costCodeId_idx" ON "finance_entries"("costCodeId");
CREATE INDEX IF NOT EXISTS "finance_entries_costType_idx"   ON "finance_entries"("costType");

DO $$ BEGIN
  ALTER TABLE "finance_entries"
    ADD CONSTRAINT "finance_entries_costCodeId_fkey"
    FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- estimate_items
ALTER TABLE "estimate_items"
  ADD COLUMN IF NOT EXISTS "costCodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "costType"   "CostType";

CREATE INDEX IF NOT EXISTS "estimate_items_costCodeId_idx" ON "estimate_items"("costCodeId");
CREATE INDEX IF NOT EXISTS "estimate_items_costType_idx"   ON "estimate_items"("costType");

DO $$ BEGIN
  ALTER TABLE "estimate_items"
    ADD CONSTRAINT "estimate_items_costCodeId_fkey"
    FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
