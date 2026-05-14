-- Polymorphic Assignee: дозволити Employee (HR-співробітник без CRM-облікового
-- запису) бути відповідальним поряд із User. Додає Employee.firmId для
-- multi-tenant ізоляції HR-списків і дропдаунів.
--
-- ⚠️ Перед `migrate deploy` на prod: запустити audit-скрипт, щоб переконатися,
--   що Studio-працівники, у яких немає User-звʼязку, отримають firmId='metrum-studio'
--   ручним апдейтом ПЕРЕД цією міграцією. Інакше backfill крок 3 поглине їх у Group.

-- =============================================================================
-- 1. Employee.firmId (nullable → backfill → NOT NULL + FK)
-- =============================================================================
ALTER TABLE "employees" ADD COLUMN "firm_id" TEXT;

-- 1a. Backfill з пов'язаного User
UPDATE "employees" e
SET "firm_id" = u."firm_id"
FROM "users" u
WHERE e."user_id" = u."id" AND e."firm_id" IS NULL AND u."firm_id" IS NOT NULL;

-- 1b. Дефолт для решти (Employee без User або у User firmId=NULL).
-- ⚠️ Перед prod-запуском перевірити: чи нема Studio-employees без User.
UPDATE "employees" SET "firm_id" = 'metrum-group' WHERE "firm_id" IS NULL;

-- 1c. Закріпити NOT NULL + FK + indexes
ALTER TABLE "employees" ALTER COLUMN "firm_id" SET NOT NULL;
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "employees_firm_id_idx" ON "employees"("firm_id");
CREATE INDEX "employees_firm_id_is_active_idx" ON "employees"("firm_id", "is_active");

-- =============================================================================
-- 2. TaskAssignee: userId → nullable, додати employee_id + XOR CHECK
-- =============================================================================
ALTER TABLE "task_assignees" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "task_assignees" ADD COLUMN "employee_id" TEXT;
ALTER TABLE "task_assignees"
  ADD CONSTRAINT "task_assignees_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON UPDATE CASCADE ON DELETE CASCADE;
CREATE UNIQUE INDEX "task_assignees_task_id_employee_id_key"
  ON "task_assignees"("task_id", "employee_id") WHERE "employee_id" IS NOT NULL;
CREATE INDEX "task_assignees_employee_id_idx" ON "task_assignees"("employee_id");
-- XOR: рівно одне з user_id/employee_id заповнене
ALTER TABLE "task_assignees"
  ADD CONSTRAINT "task_assignees_assignee_xor"
  CHECK (
    (("user_id" IS NOT NULL)::int + ("employee_id" IS NOT NULL)::int) = 1
  );

-- =============================================================================
-- 3. ProjectStageRecord: додати responsible_employee_id
-- =============================================================================
ALTER TABLE "project_stage_records" ADD COLUMN "responsible_employee_id" TEXT;
ALTER TABLE "project_stage_records"
  ADD CONSTRAINT "project_stage_records_responsible_employee_id_fkey"
  FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX "project_stage_records_responsible_employee_id_idx"
  ON "project_stage_records"("responsible_employee_id");
-- Контракт {responsibleUserId, responsibleEmployeeId, responsibleName} ≤ 1
-- enforce у API, бо responsibleName лишається free-text fallback для підрядників.

-- =============================================================================
-- 4. ProjectMember: userId → nullable, додати employee_id + XOR CHECK
-- =============================================================================
ALTER TABLE "project_members" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "project_members" ADD COLUMN "employee_id" TEXT;
ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON UPDATE CASCADE ON DELETE CASCADE;
CREATE UNIQUE INDEX "project_members_project_id_employee_id_key"
  ON "project_members"("project_id", "employee_id") WHERE "employee_id" IS NOT NULL;
CREATE INDEX "project_members_employee_id_is_active_idx"
  ON "project_members"("employee_id", "is_active");
ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_assignee_xor"
  CHECK (
    (("user_id" IS NOT NULL)::int + ("employee_id" IS NOT NULL)::int) = 1
  );
