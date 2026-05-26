-- SRM (Subcontractor Relationship Management) rev.1 для Counterparty.
-- ТІЛЬКИ ADDITIVE: нові enums, nullable колонки на counterparties, 3 нові таблиці.
-- Жодного DROP/ALTER на існуючих колонках — backward compatible.

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('FOP', 'TOV', 'PE', 'PJSC', 'PRJSC', 'STATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CounterpartyTaxStatus" AS ENUM ('ACTIVE', 'PROBLEM', 'SUSPENDED', 'BANKRUPT', 'LIQUIDATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CounterpartyDocumentType" AS ENUM ('LICENSE', 'PERMIT', 'CERTIFICATE', 'INSURANCE', 'CONTRACT', 'STATUTE', 'REGISTRATION', 'OTHER');

-- AlterTable counterparties: SRM fields (всі nullable / з default).
ALTER TABLE "counterparties"
  ADD COLUMN "legalForm"          "LegalForm",
  ADD COLUMN "ipn"                TEXT,
  ADD COLUMN "bankName"           TEXT,
  ADD COLUMN "licenseNumber"      TEXT,
  ADD COLUMN "licenseValidUntil"  TIMESTAMP(3),
  ADD COLUMN "dabiRegistration"   TEXT,
  ADD COLUMN "taxStatus"          "CounterpartyTaxStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "taxStatusCheckedAt" TIMESTAMP(3),
  ADD COLUMN "specializations"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "avgRating"          DECIMAL(3,2),
  ADD COLUMN "totalProjects"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalReviews"       INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "counterparties_taxStatus_idx" ON "counterparties"("taxStatus");

-- CreateTable counterparty_reviews
CREATE TABLE "counterparty_reviews" (
  "id"                 TEXT NOT NULL,
  "counterpartyId"     TEXT NOT NULL,
  "byUserId"           TEXT NOT NULL,
  "projectId"          TEXT NOT NULL,
  "rating"             DECIMAL(2,1) NOT NULL,
  "qualityScore"       INTEGER NOT NULL,
  "timelinessScore"    INTEGER NOT NULL,
  "priceScore"         INTEGER NOT NULL,
  "communicationScore" INTEGER NOT NULL,
  "comment"            TEXT,
  "reviewedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "counterparty_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_reviews_counterpartyId_byUserId_projectId_key"
  ON "counterparty_reviews"("counterpartyId", "byUserId", "projectId");
CREATE INDEX "counterparty_reviews_counterpartyId_idx" ON "counterparty_reviews"("counterpartyId");
CREATE INDEX "counterparty_reviews_projectId_idx" ON "counterparty_reviews"("projectId");

-- AddForeignKey
ALTER TABLE "counterparty_reviews"
  ADD CONSTRAINT "counterparty_reviews_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counterparty_reviews"
  ADD CONSTRAINT "counterparty_reviews_byUserId_fkey"
  FOREIGN KEY ("byUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "counterparty_reviews"
  ADD CONSTRAINT "counterparty_reviews_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable counterparty_documents
CREATE TABLE "counterparty_documents" (
  "id"                TEXT NOT NULL,
  "counterpartyId"    TEXT NOT NULL,
  "type"              "CounterpartyDocumentType" NOT NULL,
  "title"             TEXT NOT NULL,
  "fileUrl"           TEXT NOT NULL,
  "fileName"          TEXT NOT NULL,
  "fileSize"          INTEGER NOT NULL,
  "mimeType"          TEXT NOT NULL,
  "issuedAt"          TIMESTAMP(3),
  "validUntil"        TIMESTAMP(3),
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "notified30dAt"     TIMESTAMP(3),
  "notified7dAt"      TIMESTAMP(3),
  "notifiedExpiredAt" TIMESTAMP(3),
  "uploadedById"      TEXT NOT NULL,
  "uploadedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "counterparty_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counterparty_documents_counterpartyId_type_idx" ON "counterparty_documents"("counterpartyId", "type");
CREATE INDEX "counterparty_documents_validUntil_idx" ON "counterparty_documents"("validUntil");

-- AddForeignKey
ALTER TABLE "counterparty_documents"
  ADD CONSTRAINT "counterparty_documents_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counterparty_documents"
  ADD CONSTRAINT "counterparty_documents_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- CreateTable counterparty_compliance_checks
CREATE TABLE "counterparty_compliance_checks" (
  "id"             TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "source"         TEXT NOT NULL,
  "rawResponse"    JSONB NOT NULL,
  "resultSummary"  TEXT NOT NULL,
  "success"        BOOLEAN NOT NULL,
  "errorMessage"   TEXT,
  "checkedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "counterparty_compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counterparty_compliance_checks_counterpartyId_checkedAt_idx"
  ON "counterparty_compliance_checks"("counterpartyId", "checkedAt");

-- AddForeignKey
ALTER TABLE "counterparty_compliance_checks"
  ADD CONSTRAINT "counterparty_compliance_checks_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
