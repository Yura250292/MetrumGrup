-- AlterTable: bind a Telegram group chat to a Project
ALTER TABLE "projects"
  ADD COLUMN "telegramChatId"     BIGINT,
  ADD COLUMN "telegramLinkedAt"   TIMESTAMP(3),
  ADD COLUMN "telegramLinkedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "projects_telegramChatId_key" ON "projects"("telegramChatId");
CREATE INDEX        "projects_telegramChatId_idx" ON "projects"("telegramChatId");

-- CreateTable: short-lived expense drafts parsed from a master's free-form
-- TG message before the master confirms ("Send to manager") with a button.
-- Cleanup: rows older than 1 hour are purged by a cron task.
CREATE TABLE "pending_expense_drafts" (
    "id"           TEXT      NOT NULL,
    "chatId"       BIGINT    NOT NULL,
    "messageId"    INTEGER   NOT NULL,
    "authorUserId" TEXT      NOT NULL,
    "projectId"    TEXT      NOT NULL,
    "parsedJson"   JSONB     NOT NULL,
    "rawText"      TEXT      NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_expense_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_expense_drafts_authorUserId_idx" ON "pending_expense_drafts"("authorUserId");
CREATE INDEX "pending_expense_drafts_projectId_idx"    ON "pending_expense_drafts"("projectId");
CREATE INDEX "pending_expense_drafts_createdAt_idx"    ON "pending_expense_drafts"("createdAt");
