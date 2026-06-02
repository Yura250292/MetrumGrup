-- ClickUp-style доробки модуля задач (additive).
-- 1) Нове представлення TABLE (електронна таблиця з налаштовними колонками).
-- 2) Звʼязок задачі з рядком кошторису + ручний план витрат — для cost-колонок
--    "Витрати план/факт" (видимі лише фінанс-ролям; RBAC у API/UI).
-- Жодних DROP/RENAME. Без backfill.

-- Enum value (standalone; не використовується в цій транзакції — безпечно).
ALTER TYPE "TaskViewType" ADD VALUE IF NOT EXISTS 'TABLE';

-- Поля задачі.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "sourceEstimateItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "plannedCostManual" DECIMAL(12,2);

-- 1:1 (одна задача на рядок кошторису).
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_sourceEstimateItemId_key"
  ON "tasks"("sourceEstimateItemId");
CREATE INDEX IF NOT EXISTS "tasks_sourceEstimateItemId_idx"
  ON "tasks"("sourceEstimateItemId");

-- FK ідемпотентно: на деяких БД звʼязок міг бути створений раніше (V3-міграція,
-- відкочена лише в коді). Postgres не має ADD CONSTRAINT IF NOT EXISTS → DO-блок.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_sourceEstimateItemId_fkey'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_sourceEstimateItemId_fkey"
      FOREIGN KEY ("sourceEstimateItemId") REFERENCES "estimate_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
