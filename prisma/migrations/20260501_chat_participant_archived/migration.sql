-- AlterTable: add archivedAt to ConversationParticipant for per-user archive (hide)
ALTER TABLE "conversation_participants" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Index to quickly skip archived rows in per-user listings
CREATE INDEX "conversation_participants_userId_archivedAt_idx"
  ON "conversation_participants" ("userId", "archivedAt");
