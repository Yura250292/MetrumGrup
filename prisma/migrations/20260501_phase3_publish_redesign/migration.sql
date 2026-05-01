-- Phase 3: Sync redesign — draft/published model.
-- 1) Додаємо 6 published* колонок на project_stage_records.
-- 2) Backfill: published* := * (стартовий стан "вже опубліковано", no-op для users).
-- 3) Перейменування projection metadata → publication metadata на projects.

-- 1. Додаємо колонки.
ALTER TABLE "project_stage_records"
  ADD COLUMN IF NOT EXISTS "publishedPlanVolume"          DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "publishedFactVolume"          DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "publishedPlanUnitPrice"       DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "publishedFactUnitPrice"       DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "publishedPlanClientUnitPrice" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "publishedFactClientUnitPrice" DECIMAL(12, 2);

-- 2. Backfill: усі існуючі стейджі стартують у стані "уже опубліковано".
-- Без цього перший же запит у фінансовий журнал прочитав би NULL і дав 0,
-- що зламало б існуючі звіти.
UPDATE "project_stage_records"
SET
  "publishedPlanVolume"          = "planVolume",
  "publishedFactVolume"          = "factVolume",
  "publishedPlanUnitPrice"       = "planUnitPrice",
  "publishedFactUnitPrice"       = "factUnitPrice",
  "publishedPlanClientUnitPrice" = "planClientUnitPrice",
  "publishedFactClientUnitPrice" = "factClientUnitPrice";

-- 3. Rename projection → publication на projects.
-- IF EXISTS — щоб міграція була ідемпотентна, якщо її ганяли частково.
ALTER TABLE "projects"
  RENAME COLUMN "lastProjectedAt"   TO "lastPublishedAt";
ALTER TABLE "projects"
  RENAME COLUMN "lastProjectedById" TO "lastPublishedById";
ALTER TABLE "projects"
  RENAME COLUMN "projectionVersion" TO "publicationVersion";
