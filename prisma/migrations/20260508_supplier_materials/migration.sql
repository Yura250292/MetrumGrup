-- Phase 3 (Supplier debt tracking): supplier-specific material catalog + price history.
-- Накопичується автоматично у approve foreman-report (upsertSupplierMaterial).
-- Дає flag "подорожчання" на ForemanReportItem для UI tooltip.

-- =========================================================================
-- ForemanReportItem: price-increase metadata
-- =========================================================================

ALTER TABLE "foreman_report_items"
    ADD COLUMN "priceIncreaseFlag" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "previousUnitPrice" DECIMAL(12,2);

-- =========================================================================
-- supplier_materials
-- =========================================================================

CREATE TABLE "supplier_materials" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "lastPrice" DECIMAL(12,2),
    "lastSeenAt" TIMESTAMP(3),
    "materialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_materials_pkey" PRIMARY KEY ("id")
);

-- Idempotent upsert ключ: один запис на пару (counterparty, нормалізована назва).
CREATE UNIQUE INDEX "supplier_materials_counterpartyId_nameKey_key"
    ON "supplier_materials"("counterpartyId", "nameKey");
CREATE INDEX "supplier_materials_firmId_nameKey_idx"
    ON "supplier_materials"("firmId", "nameKey");
CREATE INDEX "supplier_materials_materialId_idx"
    ON "supplier_materials"("materialId");

ALTER TABLE "supplier_materials"
    ADD CONSTRAINT "supplier_materials_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_materials_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "firms"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_materials_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "materials"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- supplier_material_price_history
-- =========================================================================

CREATE TABLE "supplier_material_price_history" (
    "id" TEXT NOT NULL,
    "supplierMaterialId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "sourceReportId" TEXT,
    "sourceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_material_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_material_price_history_supplierMaterialId_observedAt_idx"
    ON "supplier_material_price_history"("supplierMaterialId", "observedAt");

ALTER TABLE "supplier_material_price_history"
    ADD CONSTRAINT "supplier_material_price_history_supplierMaterialId_fkey"
    FOREIGN KEY ("supplierMaterialId") REFERENCES "supplier_materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
