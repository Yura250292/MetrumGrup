-- Task 06 — AI Document Control
-- Адmin/менеджер/фінансист завантажує PDF/фото/email-attachment → AI extract →
-- auto-link до Counterparty/Project/CostCode → human review → cascade у FinanceEntry.

-- 1. Розширюємо існуючий FinanceEntrySource enum (для каскаду у FinanceEntry).
ALTER TYPE "FinanceEntrySource" ADD VALUE 'DOCUMENT_INBOX';

-- 2. Нові enums.
CREATE TYPE "IncomingDocumentType" AS ENUM (
  'INVOICE',
  'CONTRACT',
  'ACT',
  'COMMERCIAL_OFFER',
  'RECEIPT',
  'KB2V',
  'KB3',
  'WAYBILL',
  'OTHER'
);

CREATE TYPE "IncomingDocumentSource" AS ENUM (
  'UPLOAD',
  'EMAIL',
  'FOREMAN',
  'SCAN',
  'API'
);

CREATE TYPE "IncomingDocumentStatus" AS ENUM (
  'PROCESSING',
  'PARSED',
  'REVIEWED',
  'LINKED',
  'ARCHIVED',
  'FAILED'
);

CREATE TYPE "LinkedEntityType" AS ENUM (
  'FINANCE_ENTRY',
  'PROJECT',
  'CHANGE_ORDER',
  'KB2_FORM',
  'KB3_FORM',
  'COUNTERPARTY',
  'NONE'
);

-- 3. Основна таблиця: вхідний документ + AI-парс + статус.
CREATE TABLE "incoming_documents" (
  "id"               TEXT NOT NULL,
  "firmId"           TEXT NOT NULL,
  "type"             "IncomingDocumentType" NOT NULL,
  "source"           "IncomingDocumentSource" NOT NULL,
  "status"           "IncomingDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  "originalFileUrl"  TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileSizeBytes"    INTEGER NOT NULL,
  "mimeType"         TEXT NOT NULL,
  "fileHash"         TEXT,
  "extractedData"    JSONB,
  "confidence"       DECIMAL(3, 2),
  "uploadedById"     TEXT NOT NULL,
  "uploadedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById"     TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "linkedEntityType" "LinkedEntityType" NOT NULL DEFAULT 'NONE',
  "linkedEntityId"   TEXT,
  "emailFrom"        TEXT,
  "emailSubject"     TEXT,
  "emailMessageId"   TEXT,
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incoming_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incoming_documents_emailMessageId_key"
  ON "incoming_documents"("emailMessageId");

-- Dedup: один файл (за SHA-256) не може бути імпортований двічі у межах фірми.
CREATE UNIQUE INDEX "incoming_documents_firmId_fileHash_key"
  ON "incoming_documents"("firmId", "fileHash");

CREATE INDEX "incoming_documents_firmId_status_idx"
  ON "incoming_documents"("firmId", "status");
CREATE INDEX "incoming_documents_firmId_type_idx"
  ON "incoming_documents"("firmId", "type");
CREATE INDEX "incoming_documents_uploadedAt_idx"
  ON "incoming_documents"("uploadedAt");
CREATE INDEX "incoming_documents_linkedEntityType_linkedEntityId_idx"
  ON "incoming_documents"("linkedEntityType", "linkedEntityId");

ALTER TABLE "incoming_documents"
  ADD CONSTRAINT "incoming_documents_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incoming_documents"
  ADD CONSTRAINT "incoming_documents_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incoming_documents"
  ADD CONSTRAINT "incoming_documents_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Audit log AI-екстракцій (debug + cost-tracking).
CREATE TABLE "document_extraction_logs" (
  "id"           TEXT NOT NULL,
  "documentId"   TEXT NOT NULL,
  "model"        TEXT NOT NULL,
  "prompt"       TEXT NOT NULL,
  "response"     TEXT NOT NULL,
  "tokensInput"  INTEGER,
  "tokensOutput" INTEGER,
  "durationMs"   INTEGER NOT NULL,
  "success"      BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "document_extraction_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_extraction_logs_documentId_idx"
  ON "document_extraction_logs"("documentId");
CREATE INDEX "document_extraction_logs_model_success_idx"
  ON "document_extraction_logs"("model", "success");

ALTER TABLE "document_extraction_logs"
  ADD CONSTRAINT "document_extraction_logs_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "incoming_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
