-- Phase 4.3 з improvement plan: явний прапор для derived-шару фінансових
-- записів (STAGE_AUTO, ESTIMATE_AUTO, PROJECT_BUDGET). MANUAL = false.
-- Дає UI/RBAC/експортам однозначний фільтр без знання enum source.

-- AlterTable
ALTER TABLE "finance_entries"
ADD COLUMN IF NOT EXISTS "isDerived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: усі не-MANUAL записи позначаємо як derived.
UPDATE "finance_entries"
SET "isDerived" = true
WHERE source IN ('ESTIMATE_AUTO', 'PROJECT_BUDGET', 'STAGE_AUTO');
