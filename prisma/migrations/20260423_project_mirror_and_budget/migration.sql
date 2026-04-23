-- AlterEnum
ALTER TYPE "FinanceEntrySource" ADD VALUE 'PROJECT_BUDGET';

-- AlterTable
ALTER TABLE "folders" ADD COLUMN "mirroredFromProjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "folders_mirroredFromProjectId_key" ON "folders"("mirroredFromProjectId");

-- AddForeignKey
ALTER TABLE "folders"
  ADD CONSTRAINT "folders_mirroredFromProjectId_fkey"
  FOREIGN KEY ("mirroredFromProjectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
