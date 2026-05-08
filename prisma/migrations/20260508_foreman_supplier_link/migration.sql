-- Phase 2 (Supplier debt tracking): linking ForemanReportItem to supplier counterparty.
-- AI парсер заповнює counterpartyId (якщо знайдено match) або supplierGuess (raw текст).
-- На approve counterpartyId переноситься у FinanceEntry.counterpartyId.

ALTER TABLE "foreman_report_items"
    ADD COLUMN "counterpartyId" TEXT,
    ADD COLUMN "supplierGuess"  TEXT;

CREATE INDEX "foreman_report_items_counterpartyId_idx" ON "foreman_report_items"("counterpartyId");

ALTER TABLE "foreman_report_items"
    ADD CONSTRAINT "foreman_report_items_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
