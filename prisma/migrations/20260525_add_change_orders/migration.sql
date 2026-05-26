-- Task 02 — Change Orders (Дод. угоди)
-- Multi-step approval workflow: DRAFT → PENDING_PM → PENDING_ADMIN
-- → PENDING_CLIENT → APPROVED (+ REJECTED / CANCELLED finals).
-- Cascade on APPROVED creates FinanceEntry(kind=PLAN, source=CHANGE_ORDER)
-- per item, shifts Project.endDate, attaches PDF.
-- Multi-firm: CO-YYYY-NNN unique per firm.

-- ----------------------------------------------------------------------
-- 1. Enums.
-- ----------------------------------------------------------------------

CREATE TYPE "ChangeOrderType" AS ENUM (
  'ADD',
  'REMOVE',
  'SWAP'
);

CREATE TYPE "ChangeOrderStatus" AS ENUM (
  'DRAFT',
  'PENDING_PM',
  'PENDING_ADMIN',
  'PENDING_CLIENT',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

-- Extend existing FinanceEntrySource enum.
ALTER TYPE "FinanceEntrySource" ADD VALUE 'CHANGE_ORDER';

-- ----------------------------------------------------------------------
-- 2. change_orders — header table.
-- ----------------------------------------------------------------------

CREATE TABLE "change_orders" (
  "id"                  TEXT NOT NULL,
  "firmId"              TEXT NOT NULL,
  "projectId"           TEXT NOT NULL,
  "number"              TEXT NOT NULL,
  "type"                "ChangeOrderType" NOT NULL,
  "title"               TEXT NOT NULL,
  "description"         TEXT NOT NULL,
  "reasonFromClient"    TEXT,
  "costImpact"          DECIMAL(14, 2) NOT NULL,
  "scheduleImpactDays"  INTEGER NOT NULL DEFAULT 0,
  "status"              "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',

  "requestedById"       TEXT NOT NULL,
  "requestedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pmApprovedById"      TEXT,
  "pmApprovedAt"        TIMESTAMP(3),
  "adminApprovedById"   TEXT,
  "adminApprovedAt"     TIMESTAMP(3),
  "clientApprovedById"  TEXT,
  "clientApprovedAt"    TIMESTAMP(3),
  "rejectedById"        TEXT,
  "rejectedAt"          TIMESTAMP(3),
  "rejectionReason"     TEXT,
  "cancelledById"       TEXT,
  "cancelledAt"         TIMESTAMP(3),

  "aiGenerated"         BOOLEAN NOT NULL DEFAULT false,
  "aiSourceChatId"      TEXT,
  "aiConfidence"        DOUBLE PRECISION,

  "pdfUrl"              TEXT,
  "signedPdfUrl"        TEXT,

  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "change_orders_firmId_number_key" ON "change_orders" ("firmId", "number");
CREATE INDEX "change_orders_firmId_projectId_status_idx" ON "change_orders" ("firmId", "projectId", "status");
CREATE INDEX "change_orders_firmId_status_requestedAt_idx" ON "change_orders" ("firmId", "status", "requestedAt");

ALTER TABLE "change_orders"
  ADD CONSTRAINT "change_orders_firmId_fkey" FOREIGN KEY ("firmId")
    REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_requestedById_fkey" FOREIGN KEY ("requestedById")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_pmApprovedById_fkey" FOREIGN KEY ("pmApprovedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_clientApprovedById_fkey" FOREIGN KEY ("clientApprovedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_rejectedById_fkey" FOREIGN KEY ("rejectedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "change_orders_cancelledById_fkey" FOREIGN KEY ("cancelledById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 3. change_order_items.
-- ----------------------------------------------------------------------

CREATE TABLE "change_order_items" (
  "id"            TEXT NOT NULL,
  "changeOrderId" TEXT NOT NULL,
  "costCodeId"    TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "unit"          TEXT NOT NULL,
  "qty"           DECIMAL(14, 4) NOT NULL,
  "unitPrice"     DECIMAL(14, 2) NOT NULL,
  "totalPrice"    DECIMAL(14, 2) NOT NULL,
  "sign"          INTEGER NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "change_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_order_items_changeOrderId_idx" ON "change_order_items" ("changeOrderId");
CREATE INDEX "change_order_items_costCodeId_idx" ON "change_order_items" ("costCodeId");

ALTER TABLE "change_order_items"
  ADD CONSTRAINT "change_order_items_changeOrderId_fkey" FOREIGN KEY ("changeOrderId")
    REFERENCES "change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "change_order_items_costCodeId_fkey" FOREIGN KEY ("costCodeId")
    REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 4. change_order_attachments.
-- ----------------------------------------------------------------------

CREATE TABLE "change_order_attachments" (
  "id"            TEXT NOT NULL,
  "changeOrderId" TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "r2Url"         TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "fileSize"      INTEGER NOT NULL,
  "uploadedById"  TEXT NOT NULL,
  "uploadedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "change_order_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_order_attachments_changeOrderId_idx" ON "change_order_attachments" ("changeOrderId");

ALTER TABLE "change_order_attachments"
  ADD CONSTRAINT "change_order_attachments_changeOrderId_fkey" FOREIGN KEY ("changeOrderId")
    REFERENCES "change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "change_order_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 5. change_order_transitions (audit log).
-- ----------------------------------------------------------------------

CREATE TABLE "change_order_transitions" (
  "id"            TEXT NOT NULL,
  "changeOrderId" TEXT NOT NULL,
  "fromStatus"    "ChangeOrderStatus" NOT NULL,
  "toStatus"      "ChangeOrderStatus" NOT NULL,
  "actorId"       TEXT NOT NULL,
  "comment"       TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "change_order_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_order_transitions_changeOrderId_createdAt_idx"
  ON "change_order_transitions" ("changeOrderId", "createdAt");

ALTER TABLE "change_order_transitions"
  ADD CONSTRAINT "change_order_transitions_changeOrderId_fkey" FOREIGN KEY ("changeOrderId")
    REFERENCES "change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "change_order_transitions_actorId_fkey" FOREIGN KEY ("actorId")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 6. Extend existing tables with changeOrderId FK.
-- ----------------------------------------------------------------------

ALTER TABLE "finance_entries"
  ADD COLUMN "changeOrderId" TEXT;

CREATE INDEX "finance_entries_changeOrderId_idx" ON "finance_entries" ("changeOrderId");

ALTER TABLE "finance_entries"
  ADD CONSTRAINT "finance_entries_changeOrderId_fkey" FOREIGN KEY ("changeOrderId")
    REFERENCES "change_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD COLUMN "changeOrderId" TEXT;

CREATE INDEX "tasks_changeOrderId_idx" ON "tasks" ("changeOrderId");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_changeOrderId_fkey" FOREIGN KEY ("changeOrderId")
    REFERENCES "change_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
