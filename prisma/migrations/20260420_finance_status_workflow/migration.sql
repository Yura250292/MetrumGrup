-- Add FinanceEntryStatus enum
DO $$ BEGIN
    CREATE TYPE "FinanceEntryStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add status and approval fields to finance_entries
ALTER TABLE "finance_entries" ADD COLUMN IF NOT EXISTS "status" "FinanceEntryStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "finance_entries" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "finance_entries" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "finance_entries" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Add index on status
CREATE INDEX IF NOT EXISTS "finance_entries_status_idx" ON "finance_entries"("status");

-- Add foreign key for approvedBy
DO $$ BEGIN
    ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend CommentEntityType enum with FINANCE_ENTRY
ALTER TYPE "CommentEntityType" ADD VALUE IF NOT EXISTS 'FINANCE_ENTRY';
