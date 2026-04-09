-- CreateTable
CREATE TABLE "prozorro_tenders" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "valueAmount" DECIMAL(12,2) NOT NULL,
    "valueCurrency" TEXT NOT NULL DEFAULT 'UAH',
    "vatIncluded" BOOLEAN NOT NULL DEFAULT true,
    "procuringEntityName" TEXT NOT NULL,
    "procuringEntityCode" TEXT NOT NULL,
    "cpvCode" TEXT NOT NULL,
    "cpvDescription" TEXT,
    "datePublished" TIMESTAMP(3) NOT NULL,
    "dateModified" TIMESTAMP(3) NOT NULL,
    "awardedAmount" DECIMAL(12,2),
    "awardedDate" TIMESTAMP(3),
    "rawData" JSONB,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prozorro_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_tender_matches" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "similarityScore" DECIMAL(5,2) NOT NULL,
    "matchReasons" JSONB,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_tender_matches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "prozorroChecked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prozorroCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "prozorro_tenders_cpvCode_idx" ON "prozorro_tenders"("cpvCode");

-- CreateIndex
CREATE INDEX "prozorro_tenders_valueAmount_idx" ON "prozorro_tenders"("valueAmount");

-- CreateIndex
CREATE INDEX "prozorro_tenders_status_idx" ON "prozorro_tenders"("status");

-- CreateIndex
CREATE INDEX "prozorro_tenders_datePublished_idx" ON "prozorro_tenders"("datePublished");

-- CreateIndex
CREATE INDEX "estimate_tender_matches_estimateId_idx" ON "estimate_tender_matches"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_tender_matches_estimateId_tenderId_key" ON "estimate_tender_matches"("estimateId", "tenderId");

-- AddForeignKey
ALTER TABLE "estimate_tender_matches" ADD CONSTRAINT "estimate_tender_matches_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_tender_matches" ADD CONSTRAINT "estimate_tender_matches_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "prozorro_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
