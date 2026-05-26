-- Task 07 — RFI Management (Request for Information).
-- Структуровані офіційні запити інформації між підрядником і
-- проєктантом/ГІП із SLA, ескалаціями, реєстром, експортом.
-- Multi-firm: RFI.firmId через Project.firmId; numbering — per-project
-- (RFI-001, RFI-002, ...) atomic через нове поле Project.rfiCounter.

-- ----------------------------------------------------------------------
-- 1. Enums.
-- ----------------------------------------------------------------------

CREATE TYPE "RFIStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE "RFIPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

-- ----------------------------------------------------------------------
-- 2. Per-project atomic counter for RFI numbering.
-- ----------------------------------------------------------------------

ALTER TABLE "projects"
  ADD COLUMN "rfiCounter" INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------
-- 3. rfis — header table.
-- ----------------------------------------------------------------------

CREATE TABLE "rfis" (
  "id"              TEXT NOT NULL,
  "firmId"          TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "number"          TEXT NOT NULL,
  "subject"         TEXT NOT NULL,
  "question"        TEXT NOT NULL,

  "askedById"       TEXT NOT NULL,
  "askedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "assignedToId"    TEXT,
  "dueAt"           TIMESTAMP(3),

  "status"          "RFIStatus" NOT NULL DEFAULT 'OPEN',
  "priority"        "RFIPriority" NOT NULL DEFAULT 'NORMAL',

  "answer"          TEXT,
  "answeredById"    TEXT,
  "answeredAt"      TIMESTAMP(3),

  "closedById"      TEXT,
  "closedAt"        TIMESTAMP(3),

  "cancelledById"   TEXT,
  "cancelledAt"     TIMESTAMP(3),
  "cancelReason"    TEXT,

  "impactsSchedule" BOOLEAN NOT NULL DEFAULT false,
  "impactsBudget"   BOOLEAN NOT NULL DEFAULT false,

  "reminderSentAt"  TIMESTAMP(3),
  "escalatedAt"     TIMESTAMP(3),

  "changeOrderId"   TEXT,

  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rfis_projectId_number_key" ON "rfis" ("projectId", "number");
CREATE UNIQUE INDEX "rfis_changeOrderId_key" ON "rfis" ("changeOrderId");
CREATE INDEX "rfis_firmId_status_idx" ON "rfis" ("firmId", "status");
CREATE INDEX "rfis_projectId_status_idx" ON "rfis" ("projectId", "status");
CREATE INDEX "rfis_assignedToId_status_idx" ON "rfis" ("assignedToId", "status");
CREATE INDEX "rfis_dueAt_idx" ON "rfis" ("dueAt");

ALTER TABLE "rfis"
  ADD CONSTRAINT "rfis_firmId_fkey" FOREIGN KEY ("firmId")
    REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_askedById_fkey" FOREIGN KEY ("askedById")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_answeredById_fkey" FOREIGN KEY ("answeredById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_closedById_fkey" FOREIGN KEY ("closedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rfis_cancelledById_fkey" FOREIGN KEY ("cancelledById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 4. rfi_attachments — files attached to RFIs (Cloudflare R2).
-- ----------------------------------------------------------------------

CREATE TABLE "rfi_attachments" (
  "id"           TEXT NOT NULL,
  "rfiId"        TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "r2Key"        TEXT NOT NULL,
  "fileSize"     INTEGER NOT NULL,
  "mimeType"     TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "context"      TEXT NOT NULL DEFAULT 'QUESTION',

  CONSTRAINT "rfi_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rfi_attachments_rfiId_idx" ON "rfi_attachments" ("rfiId");

ALTER TABLE "rfi_attachments"
  ADD CONSTRAINT "rfi_attachments_rfiId_fkey" FOREIGN KEY ("rfiId")
    REFERENCES "rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rfi_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 5. rfi_comments — discussion thread on an RFI.
-- ----------------------------------------------------------------------

CREATE TABLE "rfi_comments" (
  "id"        TEXT NOT NULL,
  "rfiId"     TEXT NOT NULL,
  "authorId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rfi_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rfi_comments_rfiId_createdAt_idx" ON "rfi_comments" ("rfiId", "createdAt");

ALTER TABLE "rfi_comments"
  ADD CONSTRAINT "rfi_comments_rfiId_fkey" FOREIGN KEY ("rfiId")
    REFERENCES "rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rfi_comments_authorId_fkey" FOREIGN KEY ("authorId")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 6. firm_rfi_sla — per-firm SLA configuration (hours by priority).
-- Defaults: 72/48/24/8 годин. Зміни не перераховують існуючі RFI.
-- ----------------------------------------------------------------------

CREATE TABLE "firm_rfi_sla" (
  "id"          TEXT NOT NULL,
  "firmId"      TEXT NOT NULL,
  "hoursLow"    INTEGER NOT NULL DEFAULT 72,
  "hoursNormal" INTEGER NOT NULL DEFAULT 48,
  "hoursHigh"   INTEGER NOT NULL DEFAULT 24,
  "hoursUrgent" INTEGER NOT NULL DEFAULT 8,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "firm_rfi_sla_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "firm_rfi_sla_firmId_key" ON "firm_rfi_sla" ("firmId");

ALTER TABLE "firm_rfi_sla"
  ADD CONSTRAINT "firm_rfi_sla_firmId_fkey" FOREIGN KEY ("firmId")
    REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 7. Seed default SLA for existing firms (idempotent via ON CONFLICT).
-- ----------------------------------------------------------------------

INSERT INTO "firm_rfi_sla" ("id", "firmId", "hoursLow", "hoursNormal", "hoursHigh", "hoursUrgent", "updatedAt")
SELECT
  'rfi-sla-' || "id",
  "id",
  72,
  48,
  24,
  8,
  CURRENT_TIMESTAMP
FROM "firms"
ON CONFLICT ("firmId") DO NOTHING;
