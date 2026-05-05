-- Idempotent backfill marker for Telegram-imported expenses.
ALTER TABLE "finance_entries" ADD COLUMN "tgImportKey" TEXT;
CREATE UNIQUE INDEX "finance_entries_tgImportKey_key" ON "finance_entries"("tgImportKey");
