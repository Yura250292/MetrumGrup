-- CreateEnum: FinanceEntryKind
DO $$ BEGIN
  CREATE TYPE "FinanceEntryKind" AS ENUM ('PLAN', 'FACT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddColumn: finance_entries.kind
ALTER TABLE "finance_entries"
  ADD COLUMN IF NOT EXISTS "kind" "FinanceEntryKind" NOT NULL DEFAULT 'FACT';

-- AddIndex
CREATE INDEX IF NOT EXISTS "finance_entries_kind_type_idx"
  ON "finance_entries"("kind", "type");
