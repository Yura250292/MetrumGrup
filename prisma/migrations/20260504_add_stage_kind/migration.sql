-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StageKind" AS ENUM ('GROUP', 'STAGE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add column with default STAGE (backward compatible)
ALTER TABLE "project_stage_records"
  ADD COLUMN IF NOT EXISTS "kind" "StageKind" NOT NULL DEFAULT 'STAGE';
