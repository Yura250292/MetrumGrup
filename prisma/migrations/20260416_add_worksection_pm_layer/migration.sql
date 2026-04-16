-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'URL', 'USER');

-- CreateEnum
CREATE TYPE "TaskDependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "TaskViewType" AS ENUM ('LIST', 'KANBAN', 'GANTT', 'CALENDAR', 'PEOPLE');

-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_DUE_APPROACHING', 'TIME_LOGGED', 'RECURRING_CRON', 'WEBHOOK', 'EMAIL_RECEIVED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'TASK';

-- AlterEnum
ALTER TYPE "FileCategory" ADD VALUE 'TASK_ATTACHMENT';

-- CreateTable
CREATE TABLE "reference_estimates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalAreaM2" DECIMAL(10,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "sourceFormat" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "reference_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_estimate_sections" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sectionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "reference_estimate_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_estimate_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_estimate_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "statusId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedHours" DECIMAL(8,2),
    "actualHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "customFields" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "recurrenceParentId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_watchers" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_statuses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_label_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "task_label_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_custom_fields" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaskCustomFieldType" NOT NULL,
    "options" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "TaskDependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRateSnapshot" DECIMAL(10,2),
    "costSnapshot" DECIMAL(12,2),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hourly_rates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_hourly_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_work_schedules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weeklyHoursJson" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    "workingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trigger" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "conditionsJson" JSONB,
    "actionsJson" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_run_logs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB,
    "result" TEXT NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "automation_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataJson" JSONB NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataJson" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_to_task_inboxes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inboxAddress" TEXT NOT NULL,
    "defaultStatusId" TEXT,
    "defaultAssigneeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_to_task_inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "leadUserId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scopes" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "viewType" "TaskViewType" NOT NULL,
    "filtersJson" JSONB,
    "groupBy" TEXT,
    "sortBy" TEXT,
    "columnsJson" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_estimates_isActive_createdAt_idx" ON "reference_estimates"("isActive", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reference_estimate_sections_referenceId_idx" ON "reference_estimate_sections"("referenceId");

-- CreateIndex
CREATE INDEX "reference_estimate_items_sectionId_idx" ON "reference_estimate_items"("sectionId");

-- CreateIndex
CREATE INDEX "tasks_projectId_stageId_isArchived_idx" ON "tasks"("projectId", "stageId", "isArchived");

-- CreateIndex
CREATE INDEX "tasks_projectId_statusId_idx" ON "tasks"("projectId", "statusId");

-- CreateIndex
CREATE INDEX "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_taskId_userId_key" ON "task_assignees"("taskId", "userId");

-- CreateIndex
CREATE INDEX "task_watchers_userId_idx" ON "task_watchers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_watchers_taskId_userId_key" ON "task_watchers"("taskId", "userId");

-- CreateIndex
CREATE INDEX "task_statuses_projectId_position_idx" ON "task_statuses"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "task_statuses_projectId_name_key" ON "task_statuses"("projectId", "name");

-- CreateIndex
CREATE INDEX "task_labels_projectId_idx" ON "task_labels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "task_labels_projectId_name_key" ON "task_labels"("projectId", "name");

-- CreateIndex
CREATE INDEX "task_label_assignments_labelId_idx" ON "task_label_assignments"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "task_label_assignments_taskId_labelId_key" ON "task_label_assignments"("taskId", "labelId");

-- CreateIndex
CREATE INDEX "checklist_items_taskId_position_idx" ON "checklist_items"("taskId", "position");

-- CreateIndex
CREATE INDEX "task_custom_fields_projectId_position_idx" ON "task_custom_fields"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "task_custom_fields_projectId_name_key" ON "task_custom_fields"("projectId", "name");

-- CreateIndex
CREATE INDEX "task_dependencies_successorId_idx" ON "task_dependencies"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_predecessorId_successorId_key" ON "task_dependencies"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "time_logs_userId_startedAt_idx" ON "time_logs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "time_logs_taskId_startedAt_idx" ON "time_logs"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "time_logs_billable_startedAt_idx" ON "time_logs"("billable", "startedAt");

-- CreateIndex
CREATE INDEX "user_hourly_rates_userId_effectiveFrom_idx" ON "user_hourly_rates"("userId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "user_hourly_rates_projectId_userId_idx" ON "user_hourly_rates"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_work_schedules_userId_key" ON "user_work_schedules"("userId");

-- CreateIndex
CREATE INDEX "time_off_userId_startDate_idx" ON "time_off"("userId", "startDate");

-- CreateIndex
CREATE INDEX "automations_projectId_isActive_idx" ON "automations"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "automations_trigger_isActive_idx" ON "automations"("trigger", "isActive");

-- CreateIndex
CREATE INDEX "automation_run_logs_automationId_triggeredAt_idx" ON "automation_run_logs"("automationId", "triggeredAt");

-- CreateIndex
CREATE INDEX "webhooks_projectId_isActive_idx" ON "webhooks"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_createdAt_idx" ON "webhook_deliveries"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_nextAttemptAt_idx" ON "webhook_deliveries"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "task_templates_projectId_idx" ON "task_templates"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "email_to_task_inboxes_projectId_key" ON "email_to_task_inboxes"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "email_to_task_inboxes_inboxAddress_key" ON "email_to_task_inboxes"("inboxAddress");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_departmentId_name_key" ON "teams"("departmentId", "name");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE INDEX "user_integrations_provider_idx" ON "user_integrations"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_integrations_userId_provider_key" ON "user_integrations"("userId", "provider");

-- CreateIndex
CREATE INDEX "saved_views_projectId_isShared_idx" ON "saved_views"("projectId", "isShared");

-- CreateIndex
CREATE INDEX "saved_views_userId_projectId_idx" ON "saved_views"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "reference_estimates" ADD CONSTRAINT "reference_estimates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_estimate_sections" ADD CONSTRAINT "reference_estimate_sections_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "reference_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_estimate_items" ADD CONSTRAINT "reference_estimate_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "reference_estimate_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "project_stage_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "task_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "task_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_custom_fields" ADD CONSTRAINT "task_custom_fields_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hourly_rates" ADD CONSTRAINT "user_hourly_rates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hourly_rates" ADD CONSTRAINT "user_hourly_rates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_work_schedules" ADD CONSTRAINT "user_work_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run_logs" ADD CONSTRAINT "automation_run_logs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_to_task_inboxes" ADD CONSTRAINT "email_to_task_inboxes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

