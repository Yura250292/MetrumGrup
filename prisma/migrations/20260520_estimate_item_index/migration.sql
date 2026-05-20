-- Historical Estimates Knowledge Base
-- Індекс позицій з усіх збережених кошторисів. Будується синхронно
-- при saveEstimate. Джерело правди для historical price provider
-- (src/lib/price-engine/providers/historical.ts) та findSimilarEstimates
-- (src/lib/estimates/similar.ts).

CREATE TABLE "estimate_item_index" (
  "id" TEXT NOT NULL,
  "workName" TEXT NOT NULL,
  "workNameRaw" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "laborCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "estimateId" TEXT NOT NULL,
  "firmId" TEXT,
  "projectType" TEXT,
  "qualityTier" TEXT,
  "region" TEXT,
  "totalAreaM2" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "estimate_item_index_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "estimate_item_index_workName_idx" ON "estimate_item_index"("workName");
CREATE INDEX "estimate_item_index_firmId_workName_idx" ON "estimate_item_index"("firmId", "workName");
CREATE INDEX "estimate_item_index_firmId_projectType_qualityTier_idx" ON "estimate_item_index"("firmId", "projectType", "qualityTier");
CREATE INDEX "estimate_item_index_estimateId_idx" ON "estimate_item_index"("estimateId");

ALTER TABLE "estimate_item_index"
  ADD CONSTRAINT "estimate_item_index_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
