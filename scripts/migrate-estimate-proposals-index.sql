-- One-time DDL for estimate-proposal feature.
-- Run AFTER `prisma db push` brings the new tables (estimate_proposals,
-- estimate_item_proposals, estimate_item_negotiation_rounds, estimate_proposal_events).
--
-- Prisma cannot express a partial unique index in schema.prisma, so we add it manually.
-- Guarantees: at most one OPEN proposal per estimate. Closed proposals
-- (FULLY_APPROVED / REJECTED / WITHDRAWN / EXPIRED / DRAFT) do not count.
--
-- Idempotent: IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS estimate_proposals_one_active_per_estimate
  ON estimate_proposals ("estimateId")
  WHERE status IN ('SENT', 'IN_NEGOTIATION', 'PARTIALLY_APPROVED');
