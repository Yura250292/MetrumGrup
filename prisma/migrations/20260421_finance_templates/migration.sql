CREATE TABLE IF NOT EXISTS "finance_expense_templates" (
  "id" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultAmount" DECIMAL(12,2) NOT NULL,
  "type" "FinanceEntryType" NOT NULL,
  "category" TEXT NOT NULL,
  "counterparty" TEXT,
  "description" TEXT,
  "emoji" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_expense_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "finance_expense_templates_folderId_sortOrder_idx" ON "finance_expense_templates"("folderId", "sortOrder");
CREATE INDEX IF NOT EXISTS "finance_expense_templates_folderId_isActive_idx" ON "finance_expense_templates"("folderId", "isActive");

DO $$ BEGIN
  ALTER TABLE "finance_expense_templates" ADD CONSTRAINT "finance_expense_templates_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "finance_expense_templates" ADD CONSTRAINT "finance_expense_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
