-- Перевіряємо що для всіх співробітників із salaryAmount є хоча б один
-- запис історії ЗП (попередня міграція 20260504_employee_history_dept_deferral
-- мала забекфилити). Якщо в продакшені знайдеться співробітник із
-- salaryAmount > 0 без EmployeeSalary — backfill його зараз.
INSERT INTO "employee_salaries" (
  "id",
  "employeeId",
  "baseSalary",
  "coefficient",
  "currency",
  "effectiveFrom",
  "createdAt",
  "updatedAt"
)
SELECT
  'esi_legacy_' || e.id,
  e.id,
  CASE
    WHEN e."salaryType" = 'HOURLY' THEN e."salaryAmount" * 168
    ELSE e."salaryAmount"
  END,
  0,
  COALESCE(e."currency", 'UAH'),
  COALESCE(e."hiredAt", e."createdAt"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "employees" e
WHERE e."salaryAmount" IS NOT NULL
  AND e."salaryAmount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "employee_salaries" s WHERE s."employeeId" = e.id
  );

-- Видаляємо deprecated колонки. extraData вже мерджено у notes раніше.
ALTER TABLE "employees" DROP COLUMN IF EXISTS "salaryType";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "salaryAmount";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "burdenMultiplier";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "extraData";

-- Enum EmployeeSalaryType більше нікому не потрібен.
DO $$ BEGIN
  DROP TYPE "EmployeeSalaryType";
EXCEPTION WHEN dependent_objects_still_exist THEN null; WHEN undefined_object THEN null; END $$;
