-- ДКО scope-change materialization (P10). Pure additive + relax NOT NULL.
-- No DROP/RENAME of data columns. Безпечно для prod.
--
--   * EstimateItem:  + sourceType, + sourceChangeOrderItemId, + baseEstimateItemId,
--                    + isReportable
--   * ChangeOrderItem: costCodeId NOT NULL → nullable; + action, + estimateItemId,
--                    + quantityDelta, + newQuantity, + unitCost, + unitPriceCustomer,
--                    + sectionId, + foremanId, + executorText
--   * New enums: EstimateItemSource, ChangeOrderItemAction
--
-- isReportable дефолт true → усі наявні роботи лишаються reportable.
-- sourceType дефолт ORIGINAL → наявні позиції позначені як первинні.
-- (Backfill isReportable = (itemType != 'material') — окремий tsx-скрипт I7.)

CREATE TYPE "EstimateItemSource"    AS ENUM ('ORIGINAL', 'CHANGE_ORDER');
CREATE TYPE "ChangeOrderItemAction" AS ENUM ('ADD', 'MODIFY', 'REMOVE');

-- ─────────────────────────────────────────────────────────────────────────
-- ESTIMATE_ITEMS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "estimate_items"
  ADD COLUMN "sourceType"              "EstimateItemSource" NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN "sourceChangeOrderItemId" TEXT,
  ADD COLUMN "baseEstimateItemId"      TEXT,
  ADD COLUMN "isReportable"            BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "estimate_items_sourceChangeOrderItemId_idx"
  ON "estimate_items"("sourceChangeOrderItemId");

-- ─────────────────────────────────────────────────────────────────────────
-- CHANGE_ORDER_ITEMS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "change_order_items"
  ALTER COLUMN "costCodeId" DROP NOT NULL;

ALTER TABLE "change_order_items"
  ADD COLUMN "action"            "ChangeOrderItemAction",
  ADD COLUMN "estimateItemId"    TEXT,
  ADD COLUMN "quantityDelta"     DECIMAL(14, 4),
  ADD COLUMN "newQuantity"       DECIMAL(14, 4),
  ADD COLUMN "unitCost"          DECIMAL(14, 2),
  ADD COLUMN "unitPriceCustomer" DECIMAL(14, 2),
  ADD COLUMN "sectionId"         TEXT,
  ADD COLUMN "foremanId"         TEXT,
  ADD COLUMN "executorText"      TEXT;

CREATE INDEX "change_order_items_estimateItemId_idx"
  ON "change_order_items"("estimateItemId");
