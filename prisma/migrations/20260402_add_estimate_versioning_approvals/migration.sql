-- CreateTable
CREATE TABLE IF NOT EXISTS "estimate_versions" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL,
    "financialSnapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "changeDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "estimate_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "estimate_approval_steps" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "notes" TEXT,
    "signatureHash" TEXT NOT NULL,
    "signatureData" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT NOT NULL,

    CONSTRAINT "estimate_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "estimate_critical_changes" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionId" TEXT,
    "changeType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "impactScore" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT NOT NULL,

    CONSTRAINT "estimate_critical_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "estimate_versions_estimateId_versionNumber_key" ON "estimate_versions"("estimateId", "versionNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "estimate_versions_estimateId_createdAt_idx" ON "estimate_versions"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "estimate_approval_steps_estimateId_reviewedAt_idx" ON "estimate_approval_steps"("estimateId", "reviewedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "estimate_approval_steps_reviewedById_idx" ON "estimate_approval_steps"("reviewedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "estimate_critical_changes_estimateId_changedAt_idx" ON "estimate_critical_changes"("estimateId", "changedAt");

-- AddForeignKey
ALTER TABLE "estimate_versions" ADD CONSTRAINT IF NOT EXISTS "estimate_versions_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_versions" ADD CONSTRAINT IF NOT EXISTS "estimate_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_approval_steps" ADD CONSTRAINT IF NOT EXISTS "estimate_approval_steps_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_approval_steps" ADD CONSTRAINT IF NOT EXISTS "estimate_approval_steps_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "estimate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_approval_steps" ADD CONSTRAINT IF NOT EXISTS "estimate_approval_steps_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_critical_changes" ADD CONSTRAINT IF NOT EXISTS "estimate_critical_changes_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_critical_changes" ADD CONSTRAINT IF NOT EXISTS "estimate_critical_changes_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "estimate_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_critical_changes" ADD CONSTRAINT IF NOT EXISTS "estimate_critical_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
