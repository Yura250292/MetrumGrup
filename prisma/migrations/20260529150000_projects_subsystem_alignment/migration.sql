-- Projects subsystem alignment with full business logic (P0 + P1).
-- Pure additive: nullable columns + new enums + indexes. No DROP/RENAME.
-- Backfill done in the same migration. NOT NULL constraints deferred to a
-- later migration after prod data verification.
--
-- Affected models:
--   * Project: + code, + type
--   * ProjectStageRecord: + actualStartDate, + actualEndDate
--   * EstimateVersion: + isLocked, + isActive, + versionType, + lockedAt, + lockedById
--   * EstimateItem: + foremanId, + executorText, + unitCost,
--                   + unitPriceCustomer, + kbItemId
--   * ForemanReport: + periodStart, + periodEnd, + stageId, + totalCalculated
--   * ForemanReportItem: + itemType, + estimateItemId, + nameOverride,
--                        + unitOverride, + pmDecision, + linkedEstimateItemId,
--                        + amountCalculated
--   * New enums: EstimateVersionType, ReportItemType, PmDecision

-- ─────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "EstimateVersionType" AS ENUM ('ORIGINAL', 'REVISED', 'FINAL');
CREATE TYPE "ReportItemType"      AS ENUM ('ESTIMATE', 'EXTRA');
CREATE TYPE "PmDecision"          AS ENUM ('PENDING', 'LINKED', 'NEW_ITEM', 'INFO_ONLY');

-- ─────────────────────────────────────────────────────────────────────────
-- PROJECT
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "projects"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "type" TEXT;

CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- ─────────────────────────────────────────────────────────────────────────
-- PROJECT_STAGE_RECORDS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "project_stage_records"
  ADD COLUMN "actualStartDate" TIMESTAMP(3),
  ADD COLUMN "actualEndDate"   TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────
-- ESTIMATE_VERSIONS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "estimate_versions"
  ADD COLUMN "isLocked"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "versionType" "EstimateVersionType" NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN "lockedAt"    TIMESTAMP(3),
  ADD COLUMN "lockedById"  TEXT;

ALTER TABLE "estimate_versions"
  ADD CONSTRAINT "estimate_versions_lockedById_fkey"
    FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "estimate_versions_estimateId_isActive_idx"
  ON "estimate_versions"("estimateId", "isActive");

-- Лише одна активна версія на estimate.
-- Partial unique — старі неактивні версії не блокують створення.
CREATE UNIQUE INDEX "estimate_versions_one_active"
  ON "estimate_versions"("estimateId")
  WHERE "isActive" = true;

-- ─────────────────────────────────────────────────────────────────────────
-- ESTIMATE_ITEMS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "estimate_items"
  ADD COLUMN "unitCost"          DECIMAL(12, 2),
  ADD COLUMN "unitPriceCustomer" DECIMAL(12, 2),
  ADD COLUMN "foremanId"         TEXT,
  ADD COLUMN "executorText"      TEXT,
  ADD COLUMN "kbItemId"          TEXT;

ALTER TABLE "estimate_items"
  ADD CONSTRAINT "estimate_items_foremanId_fkey"
    FOREIGN KEY ("foremanId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "estimate_items_foremanId_idx" ON "estimate_items"("foremanId");

-- ─────────────────────────────────────────────────────────────────────────
-- FOREMAN_REPORTS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "foreman_reports"
  ADD COLUMN "periodStart"     TIMESTAMP(3),
  ADD COLUMN "periodEnd"       TIMESTAMP(3),
  ADD COLUMN "stageId"         TEXT,
  ADD COLUMN "totalCalculated" DECIMAL(14, 2);

ALTER TABLE "foreman_reports"
  ADD CONSTRAINT "foreman_reports_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "project_stage_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "foreman_reports_stageId_idx" ON "foreman_reports"("stageId");
CREATE INDEX "foreman_reports_projectId_createdById_status_idx"
  ON "foreman_reports"("projectId", "createdById", "status");

-- ─────────────────────────────────────────────────────────────────────────
-- FOREMAN_REPORT_ITEMS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "foreman_report_items"
  ADD COLUMN "itemType"             "ReportItemType" NOT NULL DEFAULT 'EXTRA',
  ADD COLUMN "estimateItemId"       TEXT,
  ADD COLUMN "nameOverride"         TEXT,
  ADD COLUMN "unitOverride"         TEXT,
  ADD COLUMN "pmDecision"           "PmDecision",
  ADD COLUMN "linkedEstimateItemId" TEXT,
  ADD COLUMN "amountCalculated"     DECIMAL(14, 2);

ALTER TABLE "foreman_report_items"
  ADD CONSTRAINT "foreman_report_items_estimateItemId_fkey"
    FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "foreman_report_items_linkedEstimateItemId_fkey"
    FOREIGN KEY ("linkedEstimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "foreman_report_items_estimateItemId_idx"       ON "foreman_report_items"("estimateItemId");
CREATE INDEX "foreman_report_items_linkedEstimateItemId_idx" ON "foreman_report_items"("linkedEstimateItemId");
CREATE INDEX "foreman_report_items_itemType_idx"             ON "foreman_report_items"("itemType");

-- ═════════════════════════════════════════════════════════════════════════
-- BACKFILL
-- ═════════════════════════════════════════════════════════════════════════

-- EstimateItem.unitCost = unitPrice (legacy semantic — unitPrice is cost).
UPDATE "estimate_items"
SET    "unitCost" = "unitPrice"
WHERE  "unitCost" IS NULL;

-- EstimateItem.unitPriceCustomer = priceWithMargin (якщо > 0)
--                                 OR unitPrice × (1 + customMarginPercent/100)
--                                 OR unitPrice × 1.20 (default 20% margin)
--                                 OR unitPrice (fallback).
UPDATE "estimate_items"
SET    "unitPriceCustomer" = CASE
         WHEN "priceWithMargin" IS NOT NULL AND "priceWithMargin" > 0
           THEN "priceWithMargin"
         WHEN "customMarginPercent" IS NOT NULL
           THEN "unitPrice" * (1 + ("customMarginPercent" / 100.0))
         ELSE "unitPrice" * 1.20
       END
WHERE  "unitPriceCustomer" IS NULL;

-- EstimateItem.foremanId = effective stage responsible (one level deep).
-- Шукаємо ProjectStageRecord, що походить з тієї ж секції, і беремо
-- responsibleUserId. Якщо stage = null або responsibleUserId = null — лишаємо null,
-- API fallback обробить.
UPDATE "estimate_items" AS ei
SET    "foremanId" = psr."responsibleUserId"
FROM   "project_stage_records" AS psr
WHERE  ei."sectionId" IS NOT NULL
  AND  psr."sourceEstimateSectionId" = ei."sectionId"
  AND  ei."foremanId"        IS NULL
  AND  psr."responsibleUserId" IS NOT NULL;

-- ForemanReport.periodStart/End = occurredAt для legacy записів.
-- Це не семантично точно (period stays 1 day), але дозволяє UI читати поля.
UPDATE "foreman_reports"
SET    "periodStart" = "occurredAt"
WHERE  "periodStart" IS NULL;

UPDATE "foreman_reports"
SET    "periodEnd" = "occurredAt"
WHERE  "periodEnd" IS NULL;

-- EstimateVersion.versionType: лишаємо ORIGINAL для всіх legacy (DEFAULT-це робить).
-- isActive: всі legacy → true (DEFAULT). Якщо у тебе є >1 версії на estimate,
-- partial unique index впаде на створенні; зробимо явну фіксацію:
-- лишаємо isActive=true ТІЛЬКИ для MAX(versionNumber) на estimate.
UPDATE "estimate_versions" ev
SET    "isActive" = false
WHERE  ev."versionNumber" < (
         SELECT MAX("versionNumber")
         FROM   "estimate_versions"
         WHERE  "estimateId" = ev."estimateId"
       );

-- ─────────────────────────────────────────────────────────────────────────
-- DONE. NO NOT NULL / RENAME / DROP. Forward-only forward-fix.
-- ─────────────────────────────────────────────────────────────────────────
