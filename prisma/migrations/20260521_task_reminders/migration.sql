-- TaskReminder: нагадування про дедлайн задачі.
-- fireAt — абсолютний момент, коли cron має нотифікувати виконавців.
-- firedAt != null → вже відправлено (для idempotency у cron loop).
CREATE TYPE "TaskReminderKind" AS ENUM ('PERCENT', 'BEFORE_HOURS');

CREATE TABLE "task_reminders" (
  "id"        TEXT NOT NULL,
  "taskId"    TEXT NOT NULL,
  "kind"      "TaskReminderKind" NOT NULL DEFAULT 'PERCENT',
  "value"     INTEGER NOT NULL,
  "fireAt"    TIMESTAMP(3) NOT NULL,
  "firedAt"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_reminders"
  ADD CONSTRAINT "task_reminders_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "task_reminders_fireAt_firedAt_idx" ON "task_reminders"("fireAt", "firedAt");
CREATE INDEX "task_reminders_taskId_idx" ON "task_reminders"("taskId");
