-- Календарне планування етапів (кошторис-графік): тривалість + залежність
-- від попередника (тип FS/SS/FF/SF + зміщення). Additive, ідемпотентно
-- (preview-білди застосовують міграції і до прод-БД).

ALTER TABLE "project_stage_records"
  ADD COLUMN IF NOT EXISTS "plannedDurationDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "predecessorStageId" TEXT,
  ADD COLUMN IF NOT EXISTS "dependencyType" "TaskDependencyType",
  ADD COLUMN IF NOT EXISTS "dependencyLagDays" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "project_stage_records_predecessorStageId_idx"
  ON "project_stage_records"("predecessorStageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_stage_records_predecessorStageId_fkey'
  ) THEN
    ALTER TABLE "project_stage_records"
      ADD CONSTRAINT "project_stage_records_predecessorStageId_fkey"
      FOREIGN KEY ("predecessorStageId") REFERENCES "project_stage_records"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
