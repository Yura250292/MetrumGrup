-- AlterTable
ALTER TABLE "projects" ADD COLUMN "isTestProject" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "projects_isTestProject_idx" ON "projects"("isTestProject");
