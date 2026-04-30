-- Колонки об'єму/одиниць виміру у ProjectStageRecord — для нової табличної
-- картки «Етапи виконання» (план vs факт по обсягах робіт). Усі nullable,
-- існуючі рядки не зачіпаємо.

ALTER TABLE "project_stage_records" ADD COLUMN "unit" TEXT;
ALTER TABLE "project_stage_records" ADD COLUMN "planVolume" DECIMAL(12, 3);
ALTER TABLE "project_stage_records" ADD COLUMN "factVolume" DECIMAL(12, 3);

-- STAGE_RECORD у enum CommentEntityType — щоб коментарі/дискусії можна було
-- вішати безпосередньо на етап (поза вільним текстовим notes-полем).
ALTER TYPE "CommentEntityType" ADD VALUE 'STAGE_RECORD';
