-- Add MEETING value to FolderDomain enum
ALTER TYPE "FolderDomain" ADD VALUE IF NOT EXISTS 'MEETING';

-- Add folderId to meetings table
ALTER TABLE "meetings"
  ADD COLUMN IF NOT EXISTS "folderId" TEXT;

-- Foreign key meeting -> folder (SetNull on delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_folderId_fkey'
  ) THEN
    ALTER TABLE "meetings"
      ADD CONSTRAINT "meetings_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "folders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Index on folderId
CREATE INDEX IF NOT EXISTS "meetings_folderId_idx" ON "meetings"("folderId");
