-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL', 'PART', 'CONTRACT');

-- AlterTable
ALTER TABLE "employees"
  ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "employmentRate" DECIMAL(4,2) NOT NULL DEFAULT 1.0;
