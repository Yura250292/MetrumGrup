-- Task 03 — Site Forms Builder
-- No-code конструктор форм для foreman PWA: адмін збирає шаблон (КБ-2в,
-- ТБ-інструктаж, рапорт, custom); прораб офлайн заповнює, sync через
-- IndexedDB outbox; admin-v2 review queue + PDF export + Telegram бот.

-- 1. Enums.
CREATE TYPE "FormCategory" AS ENUM (
  'DAILY_REPORT',
  'SAFETY',
  'QUALITY',
  'ACCEPTANCE',
  'KB2V',
  'KB3',
  'CUSTOM'
);

CREATE TYPE "FormSubmissionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED'
);

-- 2. Шаблон форми.
CREATE TABLE "form_templates" (
  "id"          TEXT NOT NULL,
  "firmId"      TEXT,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    "FormCategory" NOT NULL DEFAULT 'CUSTOM',
  "schema"      JSONB NOT NULL,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_templates_firmId_category_isActive_idx"
  ON "form_templates"("firmId", "category", "isActive");
CREATE INDEX "form_templates_createdById_idx"
  ON "form_templates"("createdById");

ALTER TABLE "form_templates"
  ADD CONSTRAINT "form_templates_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_templates"
  ADD CONSTRAINT "form_templates_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Immutable snapshot минулих версій schema (для backward compat
-- старих submissions при evolution шаблону).
CREATE TABLE "form_template_revisions" (
  "id"          TEXT NOT NULL,
  "templateId"  TEXT NOT NULL,
  "version"     INTEGER NOT NULL,
  "schema"      JSONB NOT NULL,
  "changeNote"  TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "form_template_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_template_revisions_templateId_version_key"
  ON "form_template_revisions"("templateId", "version");
CREATE INDEX "form_template_revisions_templateId_idx"
  ON "form_template_revisions"("templateId");

ALTER TABLE "form_template_revisions"
  ADD CONSTRAINT "form_template_revisions_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_template_revisions"
  ADD CONSTRAINT "form_template_revisions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Заповнена форма. clientUuid — UUID з IndexedDB outbox; unique для
-- idempotent sync. data — fieldKey → value (string/number/bool/array/...).
CREATE TABLE "form_submissions" (
  "id"              TEXT NOT NULL,
  "firmId"          TEXT,
  "templateId"      TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "projectId"       TEXT,
  "taskId"          TEXT,
  "foremanReportId" TEXT,
  "submittedById"   TEXT NOT NULL,
  "data"            JSONB NOT NULL,
  "status"          "FormSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt"     TIMESTAMP(3),
  "reviewedById"    TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "reviewNote"      TEXT,
  "clientUuid"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_submissions_clientUuid_key"
  ON "form_submissions"("clientUuid");
CREATE INDEX "form_submissions_firmId_status_idx"
  ON "form_submissions"("firmId", "status");
CREATE INDEX "form_submissions_templateId_templateVersion_idx"
  ON "form_submissions"("templateId", "templateVersion");
CREATE INDEX "form_submissions_projectId_idx"
  ON "form_submissions"("projectId");
CREATE INDEX "form_submissions_submittedById_status_idx"
  ON "form_submissions"("submittedById", "status");

ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_foremanReportId_fkey"
  FOREIGN KEY ("foremanReportId") REFERENCES "foreman_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Вкладення (photo / file поля). Підпис canvas — зазвичай inline у data,
-- але якщо base64 > 30KB, foreman PWA вивантажить як attachment.
CREATE TABLE "form_submission_attachments" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "fieldKey"     TEXT NOT NULL,
  "r2Key"        TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "contentType"  TEXT NOT NULL,
  "sizeBytes"    INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "form_submission_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_submission_attachments_submissionId_idx"
  ON "form_submission_attachments"("submissionId");

ALTER TABLE "form_submission_attachments"
  ADD CONSTRAINT "form_submission_attachments_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
