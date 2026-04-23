-- AlterTable: add transcript column to chat_message_attachments (nullable)
ALTER TABLE "chat_message_attachments"
  ADD COLUMN IF NOT EXISTS "transcript" TEXT;
