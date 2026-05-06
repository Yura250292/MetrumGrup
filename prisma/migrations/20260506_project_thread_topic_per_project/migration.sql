-- Multi-apartment forums: a single chat can host many Projects (one per topic).
-- Drop the old single-column unique, add threadId, restore unique as composite.
DROP INDEX IF EXISTS "projects_telegramChatId_key";

ALTER TABLE "projects" ADD COLUMN "telegramThreadId" INTEGER;

-- Postgres treats NULLs as distinct in unique indexes by default, so unlinked
-- projects (both columns NULL) are still allowed in multiples.
CREATE UNIQUE INDEX "projects_telegramChatId_telegramThreadId_key"
  ON "projects" ("telegramChatId", "telegramThreadId");

CREATE INDEX "projects_telegramThreadId_idx" ON "projects"("telegramThreadId");
