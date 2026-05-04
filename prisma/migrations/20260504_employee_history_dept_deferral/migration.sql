-- 1. CreateEnum DeferralType
DO $$ BEGIN
  CREATE TYPE "DeferralType" AS ENUM ('NONE', 'RESERVATION', 'DEFERMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. (Department вже існує як модель teams/головувань; додаємо лише FK з employees)

-- 3. AddColumn employees.departmentId / deferralType / deferralUntil
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "deferralType" "DeferralType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "deferralUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "employees_departmentId_idx" ON "employees"("departmentId");

DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. CreateTable EmployeeSalary (історія ЗП)
CREATE TABLE IF NOT EXISTS "employee_salaries" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "baseSalary" DECIMAL(12,2) NOT NULL,
  "officialPart" DECIMAL(12,2),
  "coefficient" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'UAH',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "employee_salaries_employeeId_effectiveFrom_idx"
  ON "employee_salaries"("employeeId", "effectiveFrom");

DO $$ BEGIN
  ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 5. Backfill: для кожного співробітника з ненульовим salaryAmount створюємо
-- стартовий запис історії. effectiveFrom = hiredAt або createdAt; effectiveTo = NULL.
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
  'esi_' || e.id,
  e.id,
  e."salaryAmount",
  0,
  COALESCE(e."currency", 'UAH'),
  COALESCE(e."hiredAt", e."createdAt"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "employees" e
WHERE e."salaryAmount" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "employee_salaries" s WHERE s."employeeId" = e.id
  );

-- 6. Об'єднуємо extraData у notes (одне поле "Додаткова інформація"). extraData
-- лишається як deprecated-колонка для recovery, але новий код її не використовує.
UPDATE "employees"
SET "notes" =
  CASE
    WHEN "notes" IS NULL OR "notes" = '' THEN "extraData"
    WHEN "extraData" IS NULL OR "extraData" = '' THEN "notes"
    ELSE "notes" || E'\n\n' || "extraData"
  END
WHERE "extraData" IS NOT NULL AND "extraData" <> ''
  AND ("notes" IS NULL OR position(COALESCE("extraData", '') IN COALESCE("notes", '')) = 0);
