ALTER TABLE "project_files" ADD COLUMN IF NOT EXISTS "r2Key" TEXT;
ALTER TABLE "project_files" ADD COLUMN IF NOT EXISTS "textContent" TEXT;
CREATE INDEX IF NOT EXISTS "project_files_projectId_createdAt_idx" ON "project_files"("projectId", "createdAt");
