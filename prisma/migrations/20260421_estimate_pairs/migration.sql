-- Add EstimateRole enum
DO $$ BEGIN
    CREATE TYPE "EstimateRole" AS ENUM ('STANDALONE', 'CLIENT', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to estimates
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "role" "EstimateRole" NOT NULL DEFAULT 'STANDALONE';
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "estimateGroupId" TEXT;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "pairedEstimateId" TEXT;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "sourceFileR2Key" TEXT;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "sourceFileMime" TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS "estimates_estimateGroupId_idx" ON "estimates"("estimateGroupId");
CREATE INDEX IF NOT EXISTS "estimates_role_idx" ON "estimates"("role");
