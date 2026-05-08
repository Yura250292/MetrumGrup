-- Meetings: відвʼязуємо від проєкту, додаємо власний firmId.
-- Тепер нарада живе у «папці нарад» (folderId) і не має обовʼязкового projectId.
-- Старі рядки лишаються, але projectId стає опціональним; firmId беремо з project.firmId.

-- 1) Знімаємо NOT NULL з projectId
ALTER TABLE "meetings"
    ALTER COLUMN "projectId" DROP NOT NULL;

-- 2) Перевідновлюємо FK на ON DELETE SET NULL (раніше було ON DELETE CASCADE).
--    Тепер видалення проєкту не виносить нараду — лише обнуляє звʼязок.
ALTER TABLE "meetings"
    DROP CONSTRAINT IF EXISTS "meetings_projectId_fkey";

ALTER TABLE "meetings"
    ADD CONSTRAINT "meetings_projectId_fkey"
        FOREIGN KEY ("projectId")
        REFERENCES "projects"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;

-- 3) Додаємо firmId + FK + index
ALTER TABLE "meetings"
    ADD COLUMN "firmId" TEXT;

CREATE INDEX "meetings_firmId_idx" ON "meetings"("firmId");

ALTER TABLE "meetings"
    ADD CONSTRAINT "meetings_firmId_fkey"
        FOREIGN KEY ("firmId")
        REFERENCES "firms"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;

-- 4) Backfill firmId з projectId (для старих записів, де проєкт ще привʼязаний).
UPDATE "meetings" m
SET "firmId" = p."firmId"
FROM "projects" p
WHERE m."projectId" = p.id
  AND m."firmId" IS NULL;
