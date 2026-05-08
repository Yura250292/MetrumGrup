-- Phase 1 (Supplier debt tracking): foundation
-- 1) Counterparty.roles[] + defaultPaymentTermsDays + preferredPaymentMethod
-- 2) SupplierPayment + SupplierPaymentAllocation
-- Backfill ролей робиться окремим скриптом scripts/backfill-counterparty-roles.ts

-- =========================================================================
-- Enums
-- =========================================================================

CREATE TYPE "CounterpartyRole" AS ENUM ('CLIENT', 'SUPPLIER', 'CONTRACTOR', 'EMPLOYEE', 'OTHER');

CREATE TYPE "SupplierPaymentStatus" AS ENUM ('POSTED', 'VOIDED');

-- =========================================================================
-- Counterparty: нові поля
-- =========================================================================

ALTER TABLE "counterparties"
    ADD COLUMN "roles" "CounterpartyRole"[] NOT NULL DEFAULT ARRAY[]::"CounterpartyRole"[],
    ADD COLUMN "defaultPaymentTermsDays" INTEGER,
    ADD COLUMN "preferredPaymentMethod" "PaymentMethod";

-- GIN-індекс для швидких фільтрів `roles ? 'SUPPLIER'` / `&& ARRAY['SUPPLIER']`.
CREATE INDEX "counterparties_roles_idx" ON "counterparties" USING GIN ("roles");

-- =========================================================================
-- supplier_payments
-- =========================================================================

CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_payments_idempotencyKey_key" ON "supplier_payments"("idempotencyKey");
CREATE INDEX "supplier_payments_counterpartyId_occurredAt_idx" ON "supplier_payments"("counterpartyId", "occurredAt");
CREATE INDEX "supplier_payments_firmId_occurredAt_idx" ON "supplier_payments"("firmId", "occurredAt");
CREATE INDEX "supplier_payments_projectId_idx" ON "supplier_payments"("projectId");
CREATE INDEX "supplier_payments_status_idx" ON "supplier_payments"("status");

ALTER TABLE "supplier_payments"
    ADD CONSTRAINT "supplier_payments_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- supplier_payment_allocations
-- =========================================================================

CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "financeEntryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- Idempotency-замок: повторний прогін FIFO алгоритму на тому самому платежі
-- не задвоїть рядок (upsert by composite key).
CREATE UNIQUE INDEX "supplier_payment_allocations_paymentId_financeEntryId_key" ON "supplier_payment_allocations"("paymentId", "financeEntryId");
CREATE INDEX "supplier_payment_allocations_financeEntryId_idx" ON "supplier_payment_allocations"("financeEntryId");

ALTER TABLE "supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payment_allocations_financeEntryId_fkey" FOREIGN KEY ("financeEntryId") REFERENCES "finance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
