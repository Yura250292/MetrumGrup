-- Gantt-планування: додаткові колонки на tasks і estimate_items, які
-- схема описувала, але міграцій раніше не було. Pure additive (всі поля
-- nullable або defaulted), без DROP/RENAME, no destructive ops.
--
-- Cause: commit 03225d8e (Estimate→Task auto-sync + Gantt-планування)
-- ввів схему без міграції. Prisma client запитує неіснуючі колонки →
-- runtime 500 на /admin-v2/tasks і будь-яких queries що Selectують tasks
-- з повним select.
--
-- Безпечно: IF NOT EXISTS — повторні застосування ігноруються; defaults
-- задані де NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────

-- TASKS: Gantt baseline + planning + progress fraction
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "plannedStartAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "plannedEndAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "baselineFrozenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "progressPercent"  INTEGER NOT NULL DEFAULT 0;

-- ESTIMATE_ITEMS: Gantt planning (план початку/кінця, тривалість,
-- залежність-попередник з TaskDependencyType enum яка вже існує)
ALTER TABLE "estimate_items"
  ADD COLUMN IF NOT EXISTS "plannedStart"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "plannedDurationDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "plannedEnd"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "predecessorItemId"   TEXT,
  ADD COLUMN IF NOT EXISTS "dependencyType"      "TaskDependencyType",
  ADD COLUMN IF NOT EXISTS "dependencyLagDays"   INTEGER;

-- Self-referential FK для predecessorItemId. SetNull щоб видалення
-- попередника не каскадно стирало successor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'estimate_items_predecessorItemId_fkey'
  ) THEN
    ALTER TABLE "estimate_items"
      ADD CONSTRAINT "estimate_items_predecessorItemId_fkey"
        FOREIGN KEY ("predecessorItemId") REFERENCES "estimate_items"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indices for query performance
CREATE INDEX IF NOT EXISTS "estimate_items_predecessorItemId_idx"
  ON "estimate_items"("predecessorItemId");
CREATE INDEX IF NOT EXISTS "tasks_plannedStartAt_idx"
  ON "tasks"("plannedStartAt");
