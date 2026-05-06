-- ForemanReport: майстер шле звіт про витрати, менеджер затверджує
-- (ця міграція виправляє drift зі schema.prisma)

CREATE TYPE "ForemanReportStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TYPE "FinanceEntrySource" ADD VALUE IF NOT EXISTS 'FOREMAN_REPORT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FOREMAN';

ALTER TABLE "finance_entries" ADD COLUMN "foremanReportItemId" TEXT;

CREATE TABLE "foreman_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firmId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "ForemanReportStatus" NOT NULL DEFAULT 'DRAFT',
    "rawText" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "aiResultJson" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "foreman_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "foreman_report_items" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(12,3),
    "unitPrice" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "confidence" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "foreman_report_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "foreman_report_attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "foreman_report_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "foreman_reports_projectId_idx" ON "foreman_reports"("projectId");
CREATE INDEX "foreman_reports_firmId_idx" ON "foreman_reports"("firmId");
CREATE INDEX "foreman_reports_createdById_idx" ON "foreman_reports"("createdById");
CREATE INDEX "foreman_reports_status_idx" ON "foreman_reports"("status");
CREATE INDEX "foreman_report_items_reportId_idx" ON "foreman_report_items"("reportId");
CREATE INDEX "foreman_report_attachments_reportId_idx" ON "foreman_report_attachments"("reportId");
CREATE UNIQUE INDEX "finance_entries_foremanReportItemId_key" ON "finance_entries"("foremanReportItemId");

ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_foremanReportItemId_fkey" FOREIGN KEY ("foremanReportItemId") REFERENCES "foreman_report_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "foreman_reports" ADD CONSTRAINT "foreman_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "foreman_reports" ADD CONSTRAINT "foreman_reports_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "foreman_reports" ADD CONSTRAINT "foreman_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "foreman_reports" ADD CONSTRAINT "foreman_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "foreman_report_items" ADD CONSTRAINT "foreman_report_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "foreman_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "foreman_report_attachments" ADD CONSTRAINT "foreman_report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "foreman_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "foreman_report_attachments" ADD CONSTRAINT "foreman_report_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
