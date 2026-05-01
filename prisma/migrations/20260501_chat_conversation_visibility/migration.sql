-- CreateEnum: visibility for group chats (MEMBERS = invited only, EVERYONE = all staff see it)
CREATE TYPE "ConversationVisibility" AS ENUM ('MEMBERS', 'EVERYONE');

-- AlterTable: default MEMBERS keeps existing chats private
ALTER TABLE "conversations"
  ADD COLUMN "visibility" "ConversationVisibility" NOT NULL DEFAULT 'MEMBERS';

CREATE INDEX "conversations_visibility_idx" ON "conversations" ("visibility");
