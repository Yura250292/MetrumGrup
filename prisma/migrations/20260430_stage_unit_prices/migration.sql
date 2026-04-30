-- Ціна за одиницю + окрема факт-одиниця у ProjectStageRecord. Дозволяє
-- рахувати План.Витрати = planVolume × planUnitPrice і автоматично
-- синхронізувати їх у фінансування (FinanceEntry source=STAGE_AUTO).

ALTER TABLE "project_stage_records" ADD COLUMN "planUnitPrice" DECIMAL(12, 2);
ALTER TABLE "project_stage_records" ADD COLUMN "factUnitPrice" DECIMAL(12, 2);
ALTER TABLE "project_stage_records" ADD COLUMN "factUnit" TEXT;
