-- Safe Finance Migration — Phase 2: add semantic accounting layer.
-- Nullable column + new enum. No backfill, no writer changes, no index yet
-- (Phase 0 audit decides whether index is needed before queries land).

CREATE TYPE "FinanceNature" AS ENUM (
  'BUDGET_INCOME',
  'BUDGET_EXPENSE',
  'COMMITTED_INCOME',
  'COMMITTED_EXPENSE',
  'ACTUAL_INCOME',
  'ACTUAL_EXPENSE'
);

ALTER TABLE "finance_entries"
  ADD COLUMN "financeNature" "FinanceNature";
