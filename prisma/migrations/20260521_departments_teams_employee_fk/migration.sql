-- Department/Team/TeamMember: переходимо з посилання на User на посилання на Employee.
-- Це дає змогу призначати керівників/бригадирів/учасників навіть тоді, коли у
-- співробітника ще немає привʼязаного акаунта (адмін додає User-ів поступово).
--
-- Стара колонка userId / headUserId / leadUserId залишається для legacy записів
-- (read-only), але нові призначення йдуть у *_EmployeeId.

-- ============================================================
-- Department.headEmployeeId
-- ============================================================
ALTER TABLE "departments" ADD COLUMN "headEmployeeId" TEXT;
ALTER TABLE "departments"
  ADD CONSTRAINT "departments_headEmployeeId_fkey"
  FOREIGN KEY ("headEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: знаходимо Employee за існуючим headUserId.
UPDATE "departments" d
SET "headEmployeeId" = e.id
FROM "employees" e
WHERE d."headUserId" IS NOT NULL AND e."userId" = d."headUserId";

-- ============================================================
-- Team.leadEmployeeId
-- ============================================================
ALTER TABLE "teams" ADD COLUMN "leadEmployeeId" TEXT;
ALTER TABLE "teams"
  ADD CONSTRAINT "teams_leadEmployeeId_fkey"
  FOREIGN KEY ("leadEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "teams" t
SET "leadEmployeeId" = e.id
FROM "employees" e
WHERE t."leadUserId" IS NOT NULL AND e."userId" = t."leadUserId";

-- ============================================================
-- TeamMember: userId стає nullable, додаємо employeeId.
-- ============================================================
ALTER TABLE "team_members" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "team_members" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "team_members" tm
SET "employeeId" = e.id
FROM "employees" e
WHERE tm."userId" IS NOT NULL AND e."userId" = tm."userId";

CREATE INDEX "team_members_employeeId_idx" ON "team_members"("employeeId");
CREATE UNIQUE INDEX "team_members_teamId_employeeId_key" ON "team_members"("teamId", "employeeId");
