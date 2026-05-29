-- Client-side estimate negotiation (per-line versioning, token-link review).
-- See: src/lib/estimates/proposals.ts, scripts/test-estimate-proposal-flow.ts
--
-- New tables: estimate_proposals, estimate_item_proposals,
--             estimate_item_negotiation_rounds, estimate_proposal_events.
-- New enums:  EstimateProposalStatus, EstimateItemNegotiationState.
-- Altered:    EstimateStatus += 'CLIENT_REVIEW'.
-- Partial unique idx: at most one OPEN proposal per estimate (cannot be expressed in schema.prisma).

-- AlterEnum (idempotent — safe if value already present from a prior db:push)
ALTER TYPE "EstimateStatus" ADD VALUE IF NOT EXISTS 'CLIENT_REVIEW';

-- CreateEnum
CREATE TYPE "EstimateProposalStatus" AS ENUM ('DRAFT', 'SENT', 'IN_NEGOTIATION', 'PARTIALLY_APPROVED', 'FULLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EstimateItemNegotiationState" AS ENUM ('PENDING', 'CLIENT_APPROVED', 'CLIENT_REJECTED', 'CLIENT_COUNTERED', 'FIRM_COUNTERED', 'FIRM_REJECTED', 'FINAL');

-- CreateTable
CREATE TABLE "estimate_proposals" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "emailSnapshot" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "EstimateProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "baselineVersionId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "itemsTotal" INTEGER NOT NULL DEFAULT 0,
    "itemsApproved" INTEGER NOT NULL DEFAULT 0,
    "itemsRejected" INTEGER NOT NULL DEFAULT 0,
    "itemsPending" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "estimate_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_item_proposals" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "estimateItemId" TEXT NOT NULL,
    "state" "EstimateItemNegotiationState" NOT NULL DEFAULT 'PENDING',
    "currentQuantity" DECIMAL(10,3) NOT NULL,
    "currentUnitPrice" DECIMAL(10,2) NOT NULL,
    "currentAmount" DECIMAL(12,2) NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "lastActorSide" TEXT,
    "lastActionAt" TIMESTAMP(3),

    CONSTRAINT "estimate_item_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_item_negotiation_rounds" (
    "id" TEXT NOT NULL,
    "itemProposalId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "actorSide" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "proposedQuantity" DECIMAL(10,3),
    "proposedUnitPrice" DECIMAL(10,2),
    "proposedAmount" DECIMAL(12,2),
    "comment" TEXT,
    "signatureHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_item_negotiation_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_proposal_events" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorSide" TEXT,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_proposal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_proposals_accessToken_key" ON "estimate_proposals"("accessToken");

-- CreateIndex
CREATE INDEX "estimate_proposals_firmId_status_idx" ON "estimate_proposals"("firmId", "status");

-- CreateIndex
CREATE INDEX "estimate_proposals_estimateId_status_idx" ON "estimate_proposals"("estimateId", "status");

-- CreateIndex
CREATE INDEX "estimate_proposals_counterpartyId_idx" ON "estimate_proposals"("counterpartyId");

-- CreateIndex
CREATE INDEX "estimate_item_proposals_state_idx" ON "estimate_item_proposals"("state");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_item_proposals_proposalId_estimateItemId_key" ON "estimate_item_proposals"("proposalId", "estimateItemId");

-- CreateIndex
CREATE INDEX "estimate_item_negotiation_rounds_itemProposalId_createdAt_idx" ON "estimate_item_negotiation_rounds"("itemProposalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_item_negotiation_rounds_itemProposalId_roundNumber_key" ON "estimate_item_negotiation_rounds"("itemProposalId", "roundNumber");

-- CreateIndex
CREATE INDEX "estimate_proposal_events_proposalId_createdAt_idx" ON "estimate_proposal_events"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "estimate_proposal_events_eventType_idx" ON "estimate_proposal_events"("eventType");

-- CreateIndex (partial — cannot be expressed in Prisma schema; guarantees max one OPEN proposal per estimate)
CREATE UNIQUE INDEX "estimate_proposals_one_active_per_estimate"
  ON "estimate_proposals"("estimateId")
  WHERE "status" IN ('SENT', 'IN_NEGOTIATION', 'PARTIALLY_APPROVED');

-- AddForeignKey
ALTER TABLE "estimate_proposals" ADD CONSTRAINT "estimate_proposals_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_proposals" ADD CONSTRAINT "estimate_proposals_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_proposals" ADD CONSTRAINT "estimate_proposals_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_proposals" ADD CONSTRAINT "estimate_proposals_baselineVersionId_fkey" FOREIGN KEY ("baselineVersionId") REFERENCES "estimate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_proposals" ADD CONSTRAINT "estimate_proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item_proposals" ADD CONSTRAINT "estimate_item_proposals_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "estimate_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item_proposals" ADD CONSTRAINT "estimate_item_proposals_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item_negotiation_rounds" ADD CONSTRAINT "estimate_item_negotiation_rounds_itemProposalId_fkey" FOREIGN KEY ("itemProposalId") REFERENCES "estimate_item_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item_negotiation_rounds" ADD CONSTRAINT "estimate_item_negotiation_rounds_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_proposal_events" ADD CONSTRAINT "estimate_proposal_events_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "estimate_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
