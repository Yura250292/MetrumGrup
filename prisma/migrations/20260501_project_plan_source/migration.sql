-- Phase 2 з improvement plan: канонічне джерело плану на рівні проєкту.
-- Дозволяє summary/dashboard/budget-vs-actual читати один прапор замість
-- dynamic detection через FinanceEntry за кожним запитом.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProjectPlanSource" AS ENUM ('NONE', 'ESTIMATE', 'STAGE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add column with safe default
ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "planSource" "ProjectPlanSource" NOT NULL DEFAULT 'NONE';

-- Backfill: STAGE wins (canonical layer — дерево ProjectStageRecord з
-- planVolume>0 уже несе план, навіть до створення STAGE_AUTO FinanceEntry).
UPDATE "projects" p
SET "planSource" = 'STAGE'
WHERE EXISTS (
    SELECT 1 FROM "project_stage_records" psr
    WHERE psr."projectId" = p.id
      AND psr."planVolume" IS NOT NULL
      AND psr."planVolume" > 0
);

-- Залишок: проєкти з legacy ESTIMATE_AUTO записами і без stage tree
-- (pre-migration data). Поточні sync-flows конвертують їх у STAGE при
-- наступному syncEstimateToStages.
UPDATE "projects" p
SET "planSource" = 'ESTIMATE'
WHERE p."planSource" = 'NONE'
  AND EXISTS (
      SELECT 1 FROM "finance_entries" fe
      WHERE fe."projectId" = p.id
        AND fe.source = 'ESTIMATE_AUTO'
        AND fe.kind = 'PLAN'
        AND fe.type = 'EXPENSE'
  );
