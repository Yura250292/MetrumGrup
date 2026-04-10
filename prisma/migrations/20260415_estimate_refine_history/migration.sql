-- Audit trail for delta-refine runs (Plan Stage 6.2).
-- Each refine produces a new Estimate version + a row in this table that
-- captures the diff against the previous version: who, when, why, what
-- changed, by how much.

CREATE TABLE IF NOT EXISTS "estimate_refine_history" (
  "id"                  TEXT PRIMARY KEY,
  -- The refined (new) estimate that resulted from this run.
  "estimateId"          TEXT NOT NULL,
  -- The estimate this refine was based on.
  "previousEstimateId"  TEXT,
  -- User who triggered the refine (nullable in case of system / scripted runs).
  "refinedById"         TEXT,
  -- Free-form text the user supplied via additionalInfo.
  "changeReason"        TEXT,
  -- Categories the section-detector decided to regenerate.
  "impactedCategories"  JSONB,
  -- Aggregate counts for the diff.
  "addedCount"          INTEGER NOT NULL DEFAULT 0,
  "removedCount"        INTEGER NOT NULL DEFAULT 0,
  "changedCount"        INTEGER NOT NULL DEFAULT 0,
  "unchangedCount"      INTEGER NOT NULL DEFAULT 0,
  -- Money delta in UAH.
  "deltaAmount"         DECIMAL(14, 2) NOT NULL DEFAULT 0,
  -- Top-N changed items with field-level diffs (capped at 50 to keep rows small).
  "changedItems"        JSONB,
  -- Free-form metadata (e.g. uploaded file count, prozorro flag).
  "metadata"            JSONB,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT "estimate_refine_history_estimateId_fkey"
    FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE,
  CONSTRAINT "estimate_refine_history_previousEstimateId_fkey"
    FOREIGN KEY ("previousEstimateId") REFERENCES "estimates"("id") ON DELETE SET NULL,
  CONSTRAINT "estimate_refine_history_refinedById_fkey"
    FOREIGN KEY ("refinedById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "estimate_refine_history_estimateId_idx"
  ON "estimate_refine_history" ("estimateId");
CREATE INDEX IF NOT EXISTS "estimate_refine_history_previousEstimateId_idx"
  ON "estimate_refine_history" ("previousEstimateId");
CREATE INDEX IF NOT EXISTS "estimate_refine_history_createdAt_idx"
  ON "estimate_refine_history" ("createdAt" DESC);
