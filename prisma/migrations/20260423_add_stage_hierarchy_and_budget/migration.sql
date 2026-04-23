-- AlterTable
ALTER TABLE "project_stage_records"
  ADD COLUMN "parentStageId" TEXT,
  ADD COLUMN "responsibleUserId" TEXT,
  ADD COLUMN "allocatedBudget" DECIMAL(12, 2);

-- CreateIndex
CREATE INDEX "project_stage_records_projectId_parentStageId_idx" ON "project_stage_records"("projectId", "parentStageId");

-- CreateIndex
CREATE INDEX "project_stage_records_responsibleUserId_idx" ON "project_stage_records"("responsibleUserId");

-- AddForeignKey
ALTER TABLE "project_stage_records"
  ADD CONSTRAINT "project_stage_records_parentStageId_fkey"
  FOREIGN KEY ("parentStageId") REFERENCES "project_stage_records"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stage_records"
  ADD CONSTRAINT "project_stage_records_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
