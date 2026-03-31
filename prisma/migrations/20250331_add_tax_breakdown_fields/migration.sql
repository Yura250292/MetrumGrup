-- AlterTable: Add detailed tax breakdown fields to estimates table
ALTER TABLE "estimates"
ADD COLUMN IF NOT EXISTS "pdvAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "esvAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "militaryTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "profitTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "unifiedTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pdfoAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxCalculationDetails" JSONB,
ADD COLUMN IF NOT EXISTS "taxCalculatedAt" TIMESTAMP(3);

-- CreateTable: TaxRecord for audit trail
CREATE TABLE IF NOT EXISTS "tax_records" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "taxationType" "TaxationType" NOT NULL,
    "pdvAmount" DECIMAL(12,2) NOT NULL,
    "esvAmount" DECIMAL(12,2) NOT NULL,
    "militaryTaxAmount" DECIMAL(12,2) NOT NULL,
    "profitTaxAmount" DECIMAL(12,2) NOT NULL,
    "unifiedTaxAmount" DECIMAL(12,2) NOT NULL,
    "pdfoAmount" DECIMAL(12,2) NOT NULL,
    "totalTaxAmount" DECIMAL(12,2) NOT NULL,
    "netProfit" DECIMAL(12,2) NOT NULL,
    "effectiveTaxRate" DECIMAL(5,2) NOT NULL,
    "calculationDetails" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_records_estimateId_idx" ON "tax_records"("estimateId");
CREATE INDEX IF NOT EXISTS "tax_records_calculatedAt_idx" ON "tax_records"("calculatedAt");
