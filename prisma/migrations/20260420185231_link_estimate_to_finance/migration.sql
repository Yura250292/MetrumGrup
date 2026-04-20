-- CreateEnum
CREATE TYPE "FinanceEntrySource" AS ENUM ('MANUAL', 'ESTIMATE_AUTO');

-- AlterTable: estimates
ALTER TABLE "estimates"
  ADD COLUMN "financeSyncedAt"   TIMESTAMP(3),
  ADD COLUMN "financeSyncedById" TEXT;

-- AlterTable: finance_entries
ALTER TABLE "finance_entries"
  ADD COLUMN "source"         "FinanceEntrySource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "estimateId"     TEXT,
  ADD COLUMN "estimateItemId" TEXT;

-- CreateIndex
CREATE INDEX "finance_entries_estimateId_idx" ON "finance_entries"("estimateId");
CREATE INDEX "finance_entries_source_idx"     ON "finance_entries"("source");

-- AddForeignKey: estimates.financeSyncedById -> users.id
ALTER TABLE "estimates"
  ADD CONSTRAINT "estimates_financeSyncedById_fkey"
  FOREIGN KEY ("financeSyncedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: finance_entries.estimateId -> estimates.id
ALTER TABLE "finance_entries"
  ADD CONSTRAINT "finance_entries_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "estimates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: finance_entries.estimateItemId -> estimate_items.id
ALTER TABLE "finance_entries"
  ADD CONSTRAINT "finance_entries_estimateItemId_fkey"
  FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
