-- TaskAssignee: дозволяємо null userId і додаємо externalName для зовнішніх
-- виконавців (підрядники, гості, працівники без акаунту).
ALTER TABLE "task_assignees" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "task_assignees" ADD COLUMN "externalName" TEXT;
CREATE INDEX "task_assignees_taskId_idx" ON "task_assignees"("taskId");

-- Project: персональний "Inbox" для задач без проєкту. Один user → один проєкт.
ALTER TABLE "projects" ADD COLUMN "personalInboxUserId" TEXT;
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_personalInboxUserId_fkey"
  FOREIGN KEY ("personalInboxUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "projects_personalInboxUserId_key" ON "projects"("personalInboxUserId");
