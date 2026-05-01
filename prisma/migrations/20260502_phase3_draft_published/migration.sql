-- Phase 3: draft / published model для ProjectStageRecord.
-- Міграція ідемпотентна — структурні зміни уже могли бути застосовані
-- через prisma db push під час розробки, а у нашому migration-журналі
-- лишається запис для відстеження стану.

-- 1. Перейменування projection metadata на projects (вирівнюємо термінологію).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'lastProjectedAt'
  ) THEN
    ALTER TABLE "projects" RENAME COLUMN "lastProjectedAt"   TO "lastPublishedAt";
    ALTER TABLE "projects" RENAME COLUMN "lastProjectedById" TO "lastPublishedById";
    ALTER TABLE "projects" RENAME COLUMN "projectionVersion" TO "publicationVersion";
  END IF;
END $$;

-- 2. Додати published* колонки на стейджах (якщо ще нема).
ALTER TABLE "project_stage_records"
ADD COLUMN IF NOT EXISTS "publishedPlanVolume"          DECIMAL(12, 3),
ADD COLUMN IF NOT EXISTS "publishedFactVolume"          DECIMAL(12, 3),
ADD COLUMN IF NOT EXISTS "publishedPlanUnitPrice"       DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "publishedFactUnitPrice"       DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "publishedPlanClientUnitPrice" DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "publishedFactClientUnitPrice" DECIMAL(12, 2);

-- 3. Backfill для проєктів які вже мали publish (publicationVersion > 0):
--    копіюємо поточні draft-значення у published* щоб поведінка зберіглася.
--    UPDATE без WHERE-фільтра по published* був би перезаписом — обмежуємо
--    тільки тими стейджами, де всі published* ще NULL.
UPDATE "project_stage_records" psr
SET
  "publishedPlanVolume"          = COALESCE(psr."publishedPlanVolume",          psr."planVolume"),
  "publishedFactVolume"          = COALESCE(psr."publishedFactVolume",          psr."factVolume"),
  "publishedPlanUnitPrice"       = COALESCE(psr."publishedPlanUnitPrice",       psr."planUnitPrice"),
  "publishedFactUnitPrice"       = COALESCE(psr."publishedFactUnitPrice",       psr."factUnitPrice"),
  "publishedPlanClientUnitPrice" = COALESCE(psr."publishedPlanClientUnitPrice", psr."planClientUnitPrice"),
  "publishedFactClientUnitPrice" = COALESCE(psr."publishedFactClientUnitPrice", psr."factClientUnitPrice")
FROM "projects" p
WHERE psr."projectId" = p.id
  AND p."publicationVersion" > 0;
