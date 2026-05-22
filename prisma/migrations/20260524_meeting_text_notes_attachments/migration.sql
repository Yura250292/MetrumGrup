-- Текстові наради + вкладення.
-- 1. Meeting.noteText — оригінальна Markdown-нотатка для нарад без аудіо.
--    AI-підсумок генерується окремо й цей текст не змінює.
-- 2. meeting_attachments — фото/PDF/Excel/документи (довідкові матеріали).
--    Паттерн: task_attachments.

ALTER TABLE "meetings" ADD COLUMN "noteText" TEXT;

CREATE TABLE "meeting_attachments" (
  "id"           TEXT NOT NULL,
  "meetingId"    TEXT NOT NULL,
  "r2Key"        TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType"     TEXT NOT NULL,
  "size"         INTEGER NOT NULL,
  "kind"         TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "meeting_attachments"
  ADD CONSTRAINT "meeting_attachments_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_attachments"
  ADD CONSTRAINT "meeting_attachments_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "meeting_attachments_meetingId_idx" ON "meeting_attachments"("meetingId");
