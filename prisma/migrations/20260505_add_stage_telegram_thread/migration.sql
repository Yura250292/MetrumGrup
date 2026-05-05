-- Bind a Telegram forum topic to a specific apartment/stage.
ALTER TABLE "project_stage_records" ADD COLUMN "telegramThreadId" INTEGER;
CREATE INDEX "project_stage_records_telegramThreadId_idx"
  ON "project_stage_records"("telegramThreadId");

-- Extend pending_expense_drafts with topic + stage + attachment metadata so we
-- can reuse the same draft for text/photo/PDF/Excel inputs and tie the entry
-- to a specific apartment.
ALTER TABLE "pending_expense_drafts"
  ADD COLUMN "threadId"        INTEGER,
  ADD COLUMN "stageRecordId"   TEXT,
  ADD COLUMN "r2Key"           TEXT,
  ADD COLUMN "attachmentMime"  TEXT,
  ADD COLUMN "attachmentName"  TEXT,
  ADD COLUMN "attachmentSize"  INTEGER;

CREATE INDEX "pending_expense_drafts_stageRecordId_idx"
  ON "pending_expense_drafts"("stageRecordId");
