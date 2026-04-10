-- Persist price-engine provenance on estimate items.
-- Plan Stage 8 backend prep: gives the UI everything it needs to render
-- "source" / "confidence" badges next to each line item.

ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "priceSource" TEXT;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "priceSourceType" TEXT;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "confidence" DECIMAL(4,3);

-- Index lets the review queue fetch low-confidence items quickly.
CREATE INDEX IF NOT EXISTS "estimate_items_confidence_idx"
  ON "estimate_items" ("confidence")
  WHERE "confidence" IS NOT NULL AND "confidence" < 0.75;
