ALTER TABLE "finance_entries" ADD COLUMN IF NOT EXISTS "remindAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "finance_entries_remindAt_idx" ON "finance_entries"("remindAt");
