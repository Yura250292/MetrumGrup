-- Tasks додаткові колонки які схема описувала, але міграцій не було:
-- `sourceEstimateItemId` — посилання на рядок кошторису, з якого створено
-- задачу (syncEstimateItemsToTasks). `changeOrderId` — для тасків з CO.
--
-- Cause: продовження інциденту з 20260531000000_gantt_planning_fields.
-- Той самий коміт 03225d8e додав sourceEstimateItemId на Task, але я
-- пропустив колонки. Prisma client запитує `select sourceEstimateItemId` →
-- Postgres повертає "column does not exist" → 500 на /admin-v2 (dashboard
-- selectає tasks).
--
-- Pure additive — IF NOT EXISTS, optional FK with SET NULL.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "sourceEstimateItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "changeOrderId"        TEXT;

-- Унікальний індекс на sourceEstimateItemId (одна задача на один рядок).
-- NULLs дозволені (Postgres: NULL ≠ NULL у unique).
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_sourceEstimateItemId_key"
  ON "tasks"("sourceEstimateItemId");

-- Indexes для performance
CREATE INDEX IF NOT EXISTS "tasks_changeOrderId_idx"
  ON "tasks"("changeOrderId");
CREATE INDEX IF NOT EXISTS "tasks_projectId_plannedStartAt_idx"
  ON "tasks"("projectId", "plannedStartAt");

-- FK на estimate_items.id (SetNull щоб видалення рядка кошторису не
-- стирало задачу — задача лишається з фактом виконання).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_sourceEstimateItemId_fkey'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_sourceEstimateItemId_fkey"
        FOREIGN KEY ("sourceEstimateItemId") REFERENCES "estimate_items"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK на change_orders.id (SetNull аналогічно)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_changeOrderId_fkey'
  ) THEN
    -- change_orders існує у БД (rfi/change_orders subsystem додано раніше)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'change_orders') THEN
      ALTER TABLE "tasks"
        ADD CONSTRAINT "tasks_changeOrderId_fkey"
          FOREIGN KEY ("changeOrderId") REFERENCES "change_orders"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
