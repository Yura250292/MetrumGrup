-- Project.client стає гнучким: free-text clientName + опційний FK на
-- Counterparty + legacy User-FK залишається (nullable).
-- Існуючі проекти не страждають: clientName backfill-ить з users.name,
-- так що рендер списків/деталей не залежить від User-CLIENT.

-- 1. Зробити clientId nullable (legacy)
ALTER TABLE "projects" ALTER COLUMN "clientId" DROP NOT NULL;

-- 2. Додати нові колонки
ALTER TABLE "projects" ADD COLUMN "clientName" TEXT;
ALTER TABLE "projects" ADD COLUMN "clientCounterpartyId" TEXT;

-- 3. Backfill clientName з users (snapshot імені — щоб після зняття
--    привʼязки до User імʼя не зникло з UI).
UPDATE "projects"
SET "clientName" = u."name"
FROM "users" u
WHERE "projects"."clientId" = u."id"
  AND "projects"."clientName" IS NULL;

-- 4. FK + index для clientCounterpartyId
CREATE INDEX "projects_clientCounterpartyId_idx"
  ON "projects"("clientCounterpartyId");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_clientCounterpartyId_fkey"
  FOREIGN KEY ("clientCounterpartyId") REFERENCES "counterparties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
