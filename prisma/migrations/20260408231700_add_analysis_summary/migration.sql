-- Add analysisSummary field to estimates table
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "analysisSummary" TEXT;
