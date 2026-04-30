-- Зв'язок ProjectStageRecord ↔ EstimateSection / EstimateItem.
-- Новий потік: AI-кошторис тепер liftається у дерево стейджів проєкту
-- (sections → top-level стейджі, items → child-стейджі), а не у плоский
-- список FinanceEntry. STAGE_AUTO sync робить решту автоматично.
--
-- При re-syncʼу мапінг section/item → stage використовується для upsert
-- (без створення дублікатів). Видалена секція/item у кошторисі → SetNull,
-- стейдж не зникає (можуть бути ручні правки факту).

ALTER TABLE "project_stage_records"
  ADD COLUMN "sourceEstimateSectionId" TEXT,
  ADD COLUMN "sourceEstimateItemId" TEXT;

CREATE INDEX "project_stage_records_sourceEstimateSectionId_idx"
  ON "project_stage_records"("sourceEstimateSectionId");
CREATE INDEX "project_stage_records_sourceEstimateItemId_idx"
  ON "project_stage_records"("sourceEstimateItemId");

ALTER TABLE "project_stage_records"
  ADD CONSTRAINT "project_stage_records_sourceEstimateSectionId_fkey"
  FOREIGN KEY ("sourceEstimateSectionId") REFERENCES "estimate_sections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_stage_records"
  ADD CONSTRAINT "project_stage_records_sourceEstimateItemId_fkey"
  FOREIGN KEY ("sourceEstimateItemId") REFERENCES "estimate_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
