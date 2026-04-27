-- CreateEnum: CostType
DO $$ BEGIN
  CREATE TYPE "CostType" AS ENUM ('MATERIAL', 'LABOR', 'SUBCONTRACT', 'EQUIPMENT', 'OVERHEAD', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: cost_codes
CREATE TABLE IF NOT EXISTS "cost_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "defaultCostType" "CostType",
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id")
);

-- Unique on code
CREATE UNIQUE INDEX IF NOT EXISTS "cost_codes_code_key" ON "cost_codes"("code");

-- Indexes
CREATE INDEX IF NOT EXISTS "cost_codes_parentId_sortOrder_idx" ON "cost_codes"("parentId", "sortOrder");
CREATE INDEX IF NOT EXISTS "cost_codes_isActive_idx" ON "cost_codes"("isActive");

-- Self-FK
DO $$ BEGIN
  ALTER TABLE "cost_codes"
    ADD CONSTRAINT "cost_codes_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
