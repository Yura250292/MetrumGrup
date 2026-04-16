-- CreateEnum: FinanceEntryType
DO $$ BEGIN
  CREATE TYPE "FinanceEntryType" AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: finance_entries
CREATE TABLE IF NOT EXISTS "finance_entries" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "type" "FinanceEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "projectId" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "counterparty" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "finance_entries_projectId_occurredAt_idx"
  ON "finance_entries"("projectId", "occurredAt");
CREATE INDEX IF NOT EXISTS "finance_entries_type_occurredAt_idx"
  ON "finance_entries"("type", "occurredAt");
CREATE INDEX IF NOT EXISTS "finance_entries_category_idx"
  ON "finance_entries"("category");
CREATE INDEX IF NOT EXISTS "finance_entries_isArchived_idx"
  ON "finance_entries"("isArchived");

-- CreateTable: finance_entry_attachments
CREATE TABLE IF NOT EXISTS "finance_entry_attachments" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_entry_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "finance_entry_attachments_entryId_idx"
  ON "finance_entry_attachments"("entryId");

-- AddForeignKeys
DO $$ BEGIN
  ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "finance_entry_attachments" ADD CONSTRAINT "finance_entry_attachments_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "finance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "finance_entry_attachments" ADD CONSTRAINT "finance_entry_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
