-- CreateEnum: FileCategory
DO $$ BEGIN
  CREATE TYPE "FileCategory" AS ENUM (
    'PLAN',
    'CONTRACT',
    'TECH_DOC',
    'NOTE',
    'PHOTO_ATTACHMENT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum: FileVisibility
DO $$ BEGIN
  CREATE TYPE "FileVisibility" AS ENUM ('TEAM', 'CLIENT', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddColumn: project_files
DO $$ BEGIN
  ALTER TABLE "project_files" ADD COLUMN "category" "FileCategory" NOT NULL DEFAULT 'OTHER';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_files" ADD COLUMN "visibility" "FileVisibility" NOT NULL DEFAULT 'TEAM';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_files" ADD COLUMN "linkedEntityType" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_files" ADD COLUMN "linkedEntityId" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE INDEX IF NOT EXISTS "project_files_projectId_visibility_idx"
  ON "project_files"("projectId", "visibility");

-- Heuristic backfill of category from existing FileType
UPDATE "project_files" SET "category" = 'PLAN' WHERE "type" = 'PLAN' AND "category" = 'OTHER';
UPDATE "project_files" SET "category" = 'TECH_DOC' WHERE "type" = 'DOCUMENT' AND "category" = 'OTHER';
UPDATE "project_files" SET "category" = 'PHOTO_ATTACHMENT' WHERE "type" = 'PHOTO_REPORT' AND "category" = 'OTHER';
