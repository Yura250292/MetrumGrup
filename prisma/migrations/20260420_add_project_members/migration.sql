-- CreateEnum: ProjectRole
DO $$ BEGIN
  CREATE TYPE "ProjectRole" AS ENUM (
    'PROJECT_ADMIN',
    'PROJECT_MANAGER',
    'ENGINEER',
    'FOREMAN',
    'FINANCE',
    'PROCUREMENT',
    'VIEWER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: project_members
CREATE TABLE IF NOT EXISTS "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInProject" "ProjectRole" NOT NULL,
    "permissions" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_members_projectId_userId_key"
  ON "project_members"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "project_members_userId_isActive_idx"
  ON "project_members"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "project_members_projectId_roleInProject_idx"
  ON "project_members"("projectId", "roleInProject");

-- AddForeignKeys
DO $$ BEGIN
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
