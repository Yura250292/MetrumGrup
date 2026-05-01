-- Phase 3 prep + Phase 6.3 audit dashboard: projection metadata на проєкті.
-- Bump-аться при materialize-евентах (estimate→stages, stage-auto,
-- project-budget). Дозволяє рахувати dirty-state і показувати last-projected
-- timestamps у audit-дашборді без потреби в окремій audit-таблиці.

ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "lastProjectedAt"   TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastProjectedById" TEXT,
ADD COLUMN IF NOT EXISTS "projectionVersion" INTEGER NOT NULL DEFAULT 0;

-- Backfill: проєкти, які вже мають canonical детальний план, отримують
-- стартову позначку — інакше вони назавжди залишаться "never projected"
-- у дашборді, що було б вводячи в оману.
UPDATE "projects"
SET
  "lastProjectedAt" = COALESCE("lastProjectedAt", NOW()),
  "projectionVersion" = GREATEST("projectionVersion", 1)
WHERE "planSource" IN ('ESTIMATE', 'STAGE');
