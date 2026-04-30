-- «Вартість для замовника» — ціна за одиницю, за якою замовник платить
-- (на відміну від `planUnitPrice` / `factUnitPrice`, які зберігають
-- собівартість/закупку). Маржа за етапом = (clientUnitPrice − unitPrice) × volume.
-- Із цих полів upsert-аться STAGE_AUTO INCOME FinanceEntry-записи.

ALTER TABLE "project_stage_records" ADD COLUMN "planClientUnitPrice" DECIMAL(12, 2);
ALTER TABLE "project_stage_records" ADD COLUMN "factClientUnitPrice" DECIMAL(12, 2);
