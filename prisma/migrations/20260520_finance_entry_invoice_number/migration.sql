-- Add invoiceNumber to FinanceEntry for supplier-invoice ledger imports
-- See: src/lib/financing/invoice-import/

ALTER TABLE "finance_entries" ADD COLUMN "invoiceNumber" TEXT;

CREATE INDEX "finance_entries_invoiceNumber_idx"
  ON "finance_entries" ("invoiceNumber");

CREATE INDEX "finance_entries_firmId_counterpartyId_invoiceNumber_idx"
  ON "finance_entries" ("firmId", "counterpartyId", "invoiceNumber");
