-- Persist quantity-engine metadata on estimate items.
-- Plan 3.2: distinguish material / labor / equipment / composite rows.
-- Plus engineKey (stable canonical id) and quantityFormula for traceability.

ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "itemType" TEXT;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "engineKey" TEXT;
ALTER TABLE "estimate_items" ADD COLUMN IF NOT EXISTS "quantityFormula" TEXT;

-- Index for engineKey lookups (used by delta refine and merging).
CREATE INDEX IF NOT EXISTS "estimate_items_engineKey_idx"
  ON "estimate_items" ("engineKey")
  WHERE "engineKey" IS NOT NULL;
