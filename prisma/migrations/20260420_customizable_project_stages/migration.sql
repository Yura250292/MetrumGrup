-- Make stage nullable so custom (non-enum) stages can exist
ALTER TABLE "project_stage_records" ALTER COLUMN "stage" DROP NOT NULL;

-- Add custom-name override and hide flag
ALTER TABLE "project_stage_records"
  ADD COLUMN "customName" TEXT,
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- Replace the full unique constraint/index with a partial one.
-- (enum-backed stages still unique per project; multiple custom NULL-stage rows allowed)
ALTER TABLE "project_stage_records"
  DROP CONSTRAINT IF EXISTS "project_stage_records_projectId_stage_key";
DROP INDEX IF EXISTS "project_stage_records_projectId_stage_key";

CREATE UNIQUE INDEX "project_stage_records_projectId_stage_unique"
  ON "project_stage_records" ("projectId", "stage")
  WHERE "stage" IS NOT NULL;

CREATE INDEX "project_stage_records_projectId_stage_idx"
  ON "project_stage_records" ("projectId", "stage");

-- Add Project.currentStageRecordId (unique FK override for currentStage enum)
ALTER TABLE "projects" ADD COLUMN "currentStageRecordId" TEXT;
CREATE UNIQUE INDEX "projects_currentStageRecordId_key"
  ON "projects" ("currentStageRecordId");
