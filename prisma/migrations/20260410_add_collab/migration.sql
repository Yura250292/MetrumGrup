-- 1) Conversation.estimateId
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "estimateId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_estimateId_key" ON "conversations"("estimateId");
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_estimateId_fkey"
    FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) CommentEntityType
DO $$ BEGIN
  CREATE TYPE "CommentEntityType" AS ENUM ('ESTIMATE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) comments
CREATE TABLE IF NOT EXISTS "comments" (
  "id" TEXT NOT NULL,
  "entityType" "CommentEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "comments_entity_idx" ON "comments"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "comments_authorId_idx" ON "comments"("authorId");
DO $$ BEGIN
  ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4) reactions
CREATE TABLE IF NOT EXISTS "reactions" (
  "id" TEXT NOT NULL,
  "commentId" TEXT,
  "messageId" TEXT,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reactions_comment_uniq" ON "reactions"("commentId", "userId", "emoji");
CREATE UNIQUE INDEX IF NOT EXISTS "reactions_message_uniq" ON "reactions"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "reactions_commentId_idx" ON "reactions"("commentId");
CREATE INDEX IF NOT EXISTS "reactions_messageId_idx" ON "reactions"("messageId");
DO $$ BEGIN
  ALTER TABLE "reactions" ADD CONSTRAINT "reactions_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "reactions" ADD CONSTRAINT "reactions_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
