-- TaskAttachment: вкладення до задачі (PDF/Word/Excel/картинки тощо)
-- зберігається у Cloudflare R2; рядок містить ключ + метадані.
-- Паттерн: foreman_report_attachments.
CREATE TABLE "task_attachments" (
  "id"            TEXT NOT NULL,
  "taskId"        TEXT NOT NULL,
  "r2Key"         TEXT NOT NULL,
  "originalName"  TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "uploadedById"  TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_attachments"
  ADD CONSTRAINT "task_attachments_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_attachments"
  ADD CONSTRAINT "task_attachments_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "task_attachments_taskId_idx" ON "task_attachments"("taskId");
