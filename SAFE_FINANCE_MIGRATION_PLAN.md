# Safe Finance Migration Plan

## Goal

Safely evolve the current financial model from a mixed `PLAN/FACT` implementation into a clearer multi-layer model that separates:

- estimate
- approved budget
- committed/accrued obligations
- actual cash movements

The key requirement is zero-loss migration with backward compatibility during the transition.

This document is based on the current project state in `metrum-group` as of 2026-05-12.

## Executive Summary

The current system already contains several financial sub-models that overlap:

- `ESTIMATE_AUTO` derived records from estimates
- `STAGE_AUTO` derived records from project stages
- `FOREMAN_REPORT` records for field-reported expenses
- `MANUAL` records for direct finance operations and invoice imports
- `KB2` workflow for client-side billing
- `SupplierPayment` + allocations for payable settlement

The main issue is not lack of functionality. The main issue is semantic drift:

- `FACT` sometimes means actual cash movement
- `FACT` sometimes means actual performed work volume
- `PLAN` sometimes means approved budget
- `PLAN` sometimes means draft/preliminary estimate

This causes reporting ambiguity, incorrect KPI meaning, and makes future automation risky.

The safe migration strategy is:

1. Freeze incorrect semantics for all new writes.
2. Add a new accounting classification layer without breaking old fields.
3. Move read-models to the new classification.
4. Move write-paths one by one.
5. Only then deprecate legacy semantics.

## Current State

### Main Financial Entities

#### `FinanceEntry`

Primary ledger-like table.

Current key dimensions:

- `kind`: `PLAN | FACT`
- `type`: `INCOME | EXPENSE`
- `status`: `DRAFT | PENDING | APPROVED | PAID`
- `source`: `MANUAL | ESTIMATE_AUTO | PROJECT_BUDGET | STAGE_AUTO | FOREMAN_REPORT`
- `counterpartyId`
- `costCodeId`
- `stageRecordId`

Relevant schema:

- [schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma:556)
- enums: [schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma:1624)

#### `Estimate`

Represents estimate documents, including:

- `status`
- `role`: `STANDALONE | CLIENT | INTERNAL`
- `finalClientPrice`
- finance-review metadata

Relevant schema:

- [schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma:320)
- estimate role enum: [schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma:1769)

#### `ProjectStageRecord`

Used as a stage-based planning layer. Published values are materialized into `STAGE_AUTO` finance rows.

Relevant flow:

- publish helper: [publish-stages.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/publish-stages.ts:1)
- stage finance sync: [stage-auto-finance.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/stage-auto-finance.ts:1)

#### `SupplierPayment` and `SupplierPaymentAllocation`

This is already a meaningful settlement engine for supplier liabilities.

Relevant schema:

- [schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma:2988)

Relevant logic:

- [supplier-allocation.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/finance/supplier-allocation.ts:1)

#### `KB2Form` and `RetentionRecord`

Represents client-side billing/acts and retention flow.

Relevant logic:

- [kb2-service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/kb2-service.ts:1)

### Existing Materialization Paths

#### 1. Estimate -> FinanceEntry

Legacy estimate sync:

- [sync-from-estimate.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/sync-from-estimate.ts:24)

Observed behavior:

- `CLIENT` estimate creates `PLAN INCOME`
- `INTERNAL` estimate creates `PLAN EXPENSE`
- `STANDALONE` creates mixed expense + aggregated income

Risk:

- semantics depend on estimate role
- sync may happen too early in lifecycle

#### 2. Estimate -> Stages -> FinanceEntry

Newer stage-centric path:

- import/sync estimate into stage tree: [sync-estimate-to-stages.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/sync-estimate-to-stages.ts:37)
- publish draft stage values: [publish-stages-finance route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/publish-stages-finance/route.ts:1)
- stage materialization into finance: [stage-auto-finance.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/stage-auto-finance.ts:12)

Observed behavior:

- `STAGE_AUTO` can create:
  - `PLAN EXPENSE`
  - `FACT EXPENSE`
  - `PLAN INCOME`
  - `FACT INCOME`

Risk:

- `FACT` here is derived from physical/progress values, not necessarily real cash

#### 3. Foreman Report -> FinanceEntry

- [approve foreman report route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/foreman-reports/[id]/approve/route.ts:91)

Observed behavior:

- creates `FACT EXPENSE`
- may be linked to supplier
- used in field expense flow

Risk:

- may represent incurred cost, field-submitted cost, or cash-like cost depending on operator behavior

#### 4. Invoice Import -> FinanceEntry + SupplierPayment

- [import-invoices commit route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/financing/import-invoices/commit/route.ts:1)

Observed behavior:

- unpaid invoice -> `FACT EXPENSE` with status `APPROVED`
- paid invoice -> `FACT EXPENSE` with status `PAID` plus `SupplierPayment`

This is close to a liability + payment model, but encoded using `FACT`.

#### 5. KB2 -> FinanceEntry

- [kb2-service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/kb2-service.ts:173)

Observed behavior:

- signing a KB2 creates `PLAN INCOME`

Risk:

- signed act is closer to receivable / committed income than to budget

### Reporting Layer Today

#### `computeSummary`

- [queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/queries.ts:249)

Summary currently groups by:

- `PLAN:INCOME`
- `PLAN:EXPENSE`
- `FACT:INCOME`
- `FACT:EXPENSE`

Risk:

- this forces all reporting into a 2x2 matrix that no longer matches business reality

#### `budget-matrix`

- [budget-matrix.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/budget-matrix.ts:1)

Important note from code:

- `committed = 0` is explicitly a missing future layer

#### `cashflow`

- [cashflow.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/cashflow.ts:1)

Current behavior:

- mixes `PLAN` and `FACT` into the same timeline

Risk:

- if `FACT` includes non-cash records, cashflow becomes misleading

#### Supplier Debt

Correct outstanding calculation exists here:

- [supplier-debts route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/supplier-debts/route.ts:1)

Incorrect debt aggregation still exists here:

- [owner/queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/owner/queries.ts:37)

Risk:

- debt KPIs may overstate liabilities because partial allocations are ignored

## Target Financial Model

### Business Layers

The target model should separate the following concepts:

#### 1. Estimate

Meaning:

- rough or refined commercial/production calculation
- not yet part of the accounting ledger

Examples:

- AI preliminary estimate
- commercial estimate for client review
- internal engineering calculation

#### 2. Budget

Meaning:

- approved operating plan
- baseline for comparison and forecast

Must include:

- budgeted client income
- budgeted internal expense

#### 3. Commitment / Accrual

Meaning:

- legally or operationally incurred obligation
- money not yet paid or received

Examples:

- supplier delivered material, unpaid
- subcontractor completed work, unpaid
- signed client act, unpaid
- retention released but not yet received/paid

#### 4. Actual Cash

Meaning:

- bank/cash movement actually happened

Examples:

- supplier paid
- client payment received

### Target Classification

Do not replace `kind` immediately.

Add a new classification layer to `FinanceEntry`, for example:

- `ledgerLayer`: `BUDGET | COMMITMENT | ACTUAL`

or, preferably, a more explicit field:

- `financeNature`:
  - `BUDGET_INCOME`
  - `BUDGET_EXPENSE`
  - `COMMITTED_INCOME`
  - `COMMITTED_EXPENSE`
  - `ACTUAL_INCOME`
  - `ACTUAL_EXPENSE`

Recommendation:

Use `financeNature`.

Reason:

- it is explicit
- it removes ambiguity
- it makes read-models easier to migrate safely

## Safety Principles

### Principle 1. Never repurpose an old field mid-migration

Do not change the meaning of `kind=FACT` in place while old reports still use it.

Instead:

- add new fields
- backfill them
- migrate readers
- migrate writers
- only then retire old semantics

### Principle 2. Writer migration must happen after read compatibility exists

If new writes start using new semantics before readers can understand them, dashboards and finance screens will break.

### Principle 3. Liability settlement must stay idempotent

`SupplierPayment` and allocations already have solid idempotency/concurrency guards.

Do not bypass them during migration.

### Principle 4. Stage progress is not cash accounting

`STAGE_AUTO FACT` should not be treated as cash actual after migration.

It belongs either to:

- operational/progress analytics, or
- a separate forecast/earned-value layer

but not to cash actual accounting.

### Principle 5. No destructive backfill without snapshotting

Before any bulk migration:

- DB snapshot
- row counts per source
- row counts per `kind/type/status/source`
- checksum/control totals for major slices

## Main Risks

### Risk A. Duplicate plan layers

Symptoms:

- same project has estimate-derived plan and stage-derived plan simultaneously
- reporting double counts or silently excludes one layer

Current mitigation:

- `planSource` exists and `PROJECT_BUDGET` is excluded in summary
- [plan-source.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/plan-source.ts:1)

Remaining risk:

- no equivalent clean separation between `ESTIMATE_AUTO` and `STAGE_AUTO` for every report

### Risk B. Misclassifying liabilities as actual cash

Symptoms:

- unpaid supplier invoice appears as actual cost
- signed KB2 appears as budget instead of receivable/committed income

Impact:

- incorrect cashflow
- incorrect margin timing
- incorrect debt aging

### Risk C. Partial supplier payments broken in top-level KPIs

Symptoms:

- debt totals exceed real outstanding

Impact:

- owner dashboard loses trust

### Risk D. First-time stage auto-publish creates hidden side effects

Relevant code:

- [sync-estimate-to-stages.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/sync-estimate-to-stages.ts:210)

Impact:

- estimate import may unexpectedly materialize financial plan before intended governance step

### Risk E. UI/API contract mismatch

Relevant code:

- [types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/financing/_components/types.ts:1)

Impact:

- frontend may not correctly render existing/new sources
- future migration bugs may be hidden by weak typing

### Risk F. Reporting regression during transition

Affected areas:

- financing summary
- budget vs actual
- cashflow
- owner dashboard
- project dashboard
- supplier debt views

## Migration Strategy

## Phase 0. Preparation and Audit

### Objective

Measure current reality before changing semantics.

### Actions

1. Produce a finance inventory report.

Required cuts:

- by `source`
- by `kind/type`
- by `status`
- by project
- by `counterpartyId is null/not null`
- by `stageRecordId is null/not null`

2. Produce a semantic drift report.

Questions:

- how many `FACT` rows come from `STAGE_AUTO`
- how many `FACT` rows come from `FOREMAN_REPORT`
- how many `FACT` rows are unpaid invoices
- how many `PLAN INCOME` rows come from `KB2`
- how many `PLAN` rows came from draft estimates

3. Produce reconciliation baselines.

Baseline metrics:

- total `PLAN INCOME`
- total `PLAN EXPENSE`
- total `FACT INCOME`
- total `FACT EXPENSE`
- total supplier debt by outstanding
- count of projects by `planSource`

4. Take a database snapshot before any schema change.

### Deliverables

- SQL snapshot / dump
- audit markdown with counts
- agreed classification mapping for each source flow

### Risks

- low

### Rollback

- none needed

## Phase 1. Freeze Bad Semantics for New Writes

### Objective

Stop creating new semantically incorrect rows before adding the new model.

### Changes

1. Stop syncing draft estimate pairs directly into financing.

Current problematic path:

- [create-pair route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/create-pair/route.ts:241)

Desired change:

- creating a pair should only create estimates
- budget materialization should happen only after explicit approval/publish action

2. Define one canonical budget materialization path for each business flow.

Recommendation:

- project with stage tree -> canonical budget via stages
- legacy/non-stage projects -> canonical budget via approved internal estimate only

3. Disable or gate automatic first-time stage auto-publish unless explicitly approved by business.

Current path:

- [sync-estimate-to-stages.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/sync-estimate-to-stages.ts:210)

Recommendation:

- replace auto-publish with a controlled flag or admin-only migration mode

4. Expand frontend `source` typing to include all real backend sources.

Current mismatch:

- [types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/financing/_components/types.ts:2)

### Why do this first

Because every day of delay creates more data under broken semantics.

### Risks

- medium

Reason:

- some existing flows may rely on immediate visibility in finance after estimate creation

### Mitigations

- feature flag the behavior
- add explicit UI statuses: `Estimate created`, `Not yet published to budget`
- add admin diagnostics page showing pending-to-publish items

### Rollback

- restore previous sync behavior behind feature flag

## Phase 2. Introduce New Semantic Field

### Objective

Add a new accounting classification without breaking old reports.

### Schema Change

Add to `FinanceEntry`:

- `financeNature` nullable enum

Suggested enum values:

- `BUDGET_INCOME`
- `BUDGET_EXPENSE`
- `COMMITTED_INCOME`
- `COMMITTED_EXPENSE`
- `ACTUAL_INCOME`
- `ACTUAL_EXPENSE`

Optional companion fields:

- `recognizedAt`
- `settledAt`
- `originWorkflow`

But only add companion fields if there is a concrete reader/writer use case now.

### Initial Write Mapping

Do not backfill first.
First, start writing this field for new or updated records only in controlled flows.

Suggested initial mapping:

- approved internal estimate budget -> `BUDGET_EXPENSE`
- approved client estimate / agreed client contract amount -> `BUDGET_INCOME`
- signed KB2 -> `COMMITTED_INCOME`
- unpaid imported supplier invoice -> `COMMITTED_EXPENSE`
- paid imported supplier invoice -> `ACTUAL_EXPENSE`
- supplier payment settlement rows remain in `SupplierPayment`, not `FinanceEntry`
- foreman report approved items:
  - provisional recommendation: `COMMITTED_EXPENSE`
  - final choice requires business decision

### Important Non-Mapping

`STAGE_AUTO FACT` should not map to `ACTUAL_EXPENSE` or `ACTUAL_INCOME`.

Options:

- keep null temporarily
- map to a temporary operational-only class later

Recommendation:

- leave `financeNature = null` for `STAGE_AUTO FACT` in Phase 2

### Risks

- low to medium

### Mitigations

- nullable field
- no reader depends on it yet

### Rollback

- stop populating the field
- leave schema in place

## Phase 3. Backfill Existing Data Conservatively

### Objective

Classify historical rows with deterministic rules.

### Backfill Rules v1

These rules must be deterministic, logged, and replayable.

#### Rule Group A. Estimate-derived plan

- `source=ESTIMATE_AUTO`, `type=EXPENSE`, approved internal estimate -> `BUDGET_EXPENSE`
- `source=ESTIMATE_AUTO`, `type=INCOME`, approved client estimate -> `BUDGET_INCOME`

Do not classify draft-origin rows until draft leakage is audited.

#### Rule Group B. KB2

- signed KB2 finance entry -> `COMMITTED_INCOME`

#### Rule Group C. Supplier invoice imports

- `source=MANUAL`, invoice-import pattern, `status=APPROVED`, unpaid -> `COMMITTED_EXPENSE`
- same, `status=PAID` with linked payment/allocation -> `ACTUAL_EXPENSE`

#### Rule Group D. Foreman reports

Temporary business-safe mapping:

- `source=FOREMAN_REPORT` -> `COMMITTED_EXPENSE`

Rationale:

- safer than calling them cash actual
- later can be split into accrual vs actual if needed

#### Rule Group E. Stage auto

- `source=STAGE_AUTO`, `kind=PLAN`:
  - `type=EXPENSE` -> `BUDGET_EXPENSE`
  - `type=INCOME` -> `BUDGET_INCOME`

- `source=STAGE_AUTO`, `kind=FACT`:
  - leave `financeNature = null` in first backfill

Rationale:

- avoid false cash semantics

### Backfill Process

1. Run on staging copy.
2. Produce before/after counts by `financeNature`.
3. Sample-check 100 rows across all major sources.
4. Run on production in batches.
5. Save migration log table or file.

### Required Logging

For each batch:

- rows scanned
- rows updated
- rows skipped
- rows ambiguous
- source slices affected

### Risks

- medium

Main risk:

- accidental misclassification of historical rows

### Mitigations

- idempotent script
- dry-run mode
- audit CSV export
- ambiguous rows remain null, not forced

### Rollback

- set `financeNature = null` for rows in the migration batch using stored migration marker

## Phase 4. Migrate Read Models

### Objective

Switch dashboards and reports to the new semantic layer without breaking existing screens.

### Read Models to Migrate First

#### 1. Supplier Debt

Current issue:

- top-level debt reports ignore allocations in some places

Target behavior:

- debt = outstanding only
- read from `COMMITTED_EXPENSE`
- subtract allocations/payments

Files to refactor:

- [owner/queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/owner/queries.ts:37)
- [supplier-debts route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/supplier-debts/route.ts:1)

#### 2. Cashflow

Current issue:

- `PLAN` + `FACT` are merged, but `FACT` is not purely cash

Target behavior:

- forecast cashflow:
  - budget cash expectations optional
  - actual cash from `ACTUAL_*`
  - commitments shown separately, not merged into cash balance

File:

- [cashflow.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/cashflow.ts:1)

#### 3. Budget Matrix

Current issue:

- committed is hardcoded as zero

Target behavior:

- plan = budget rows
- committed = committed rows
- actual = actual cash rows or actual cost rows depending agreed semantics
- forecast = committed + estimated-to-complete logic

File:

- [budget-matrix.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/budget-matrix.ts:1)

#### 4. Finance Summary

Current issue:

- summary is hardwired to 2x2 `PLAN/FACT`

Target behavior:

- either:
  - keep old summary for legacy screens
  - add new v2 summary with budget/commitment/actual blocks

Recommendation:

- add v2 first, keep v1 temporarily

File:

- [queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/queries.ts:249)

### Read Migration Pattern

For each read-model:

1. Add v2 function.
2. Put behind feature flag.
3. Compare old vs new output.
4. Switch one UI at a time.

### Risks

- medium to high

Reason:

- this is where user-visible number changes happen

### Mitigations

- parallel v1/v2 rendering for admins
- diagnostics diff view
- log discrepancies above threshold

### Rollback

- switch UI/API back to v1 readers

## Phase 5. Migrate Write Paths One by One

### Objective

Change source workflows so all new records are classified correctly at creation time.

### Order of Migration

#### 5.1 Invoice Import

Why first:

- deterministic
- already closest to proper payable model

Target:

- unpaid invoice -> `COMMITTED_EXPENSE`
- paid invoice -> `ACTUAL_EXPENSE`

Relevant file:

- [import-invoices commit route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/financing/import-invoices/commit/route.ts:1)

#### 5.2 Supplier Payment Flow

Why second:

- must continue to settle outstanding committed expenses

Target:

- payment engine unchanged structurally
- reporting reads commitments + settlement consistently

Relevant files:

- [supplier-payments route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/financing/supplier-payments/route.ts:1)
- [supplier-allocation.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/finance/supplier-allocation.ts:1)

#### 5.3 KB2 Client Billing

Why third:

- clear business event semantics

Target:

- signed act -> `COMMITTED_INCOME`
- cash received later -> `ACTUAL_INCOME`

Relevant file:

- [kb2-service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/kb2-service.ts:173)

Open question:

- if no separate cash receipt flow exists yet, this needs a new writer path

#### 5.4 Estimate Budget Publication

Target:

- only approved/published internal estimate -> `BUDGET_EXPENSE`
- only approved/agreed client estimate -> `BUDGET_INCOME`

Relevant files:

- [sync-from-estimate.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/sync-from-estimate.ts:24)
- [estimate finance review route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/[id]/finance/route.ts:1)
- [estimate pair creation route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/create-pair/route.ts:1)

#### 5.5 Foreman Report

This is the most sensitive workflow.

Decision needed:

- if foreman report means “cost incurred in field” -> `COMMITTED_EXPENSE`
- if foreman report means “cash already spent by foreman” -> `ACTUAL_EXPENSE`

Recommendation:

- default to `COMMITTED_EXPENSE`
- add explicit flag later if a report item is reimbursed cash already spent

Relevant file:

- [approve foreman report route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/foreman-reports/[id]/approve/route.ts:91)

#### 5.6 Stage Auto

Target:

- stage plan stays budget layer
- stage fact is removed from accounting actual semantics

Recommendation:

- keep stage fact for operational analytics only
- exclude from accounting readers

Relevant file:

- [stage-auto-finance.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/stage-auto-finance.ts:12)

### Risks

- high

Reason:

- writer changes affect future live data immediately

### Mitigations

- feature flag per workflow
- canary release by role or firm
- per-workflow audit dashboards

### Rollback

- writer flags off
- revert to old creation semantics
- do not delete new data; mark and reclassify if needed

## Phase 6. UI and API Contract Alignment

### Objective

Make frontend aware of real backend finance states.

### Required Changes

1. Expand `FinanceEntrySource` frontend type.

Current file:

- [types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/financing/_components/types.ts:2)

2. Add `financeNature` to DTOs and filters.

3. Add UI badges for:

- Budget
- Commitment
- Actual

4. Split visual summaries:

- budget view
- payable/receivable view
- cash view

5. Avoid showing accounting users one mixed “fact” concept.

### Risks

- medium

### Mitigations

- admin-only preview UI first
- parallel rendering with old labels

## Phase 7. Legacy Deprecation

### Objective

Only after all writers/readers are migrated, start deprecating old semantics.

### Candidates for Deprecation

1. direct reporting by `kind=PLAN/FACT` only
2. `ESTIMATE_AUTO` as primary budget source for stage-enabled projects
3. `STAGE_AUTO FACT` in accounting summaries
4. any screen whose KPI labels still imply “fact = cash”

### Do Not Deprecate Yet

- `kind`
- `type`
- `status`
- `source`

They still provide useful orthogonal metadata even after `financeNature` is added.

## Testing Strategy

## Test Layers

### 1. Schema + Backfill Tests

Need tests for:

- enum creation
- nullable backfill
- idempotent rerun
- ambiguous rows stay null

### 2. Read Model Tests

Add explicit tests for:

- supplier debt with partial allocations
- cashflow excluding non-cash committed records
- budget matrix with committed column
- summary v2 totals

Existing test references:

- [queries.test.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/__tests__/queries.test.ts:1)
- [project-invariants.test.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/__tests__/project-invariants.test.ts:1)

### 3. Workflow Tests

Per workflow:

- create client/internal estimate pair
- finance review approval
- publish estimate to stages
- publish stages to finance
- approve foreman report
- import unpaid invoice
- import paid invoice
- create supplier payment with partial allocation
- sign KB2

### 4. Reconciliation Tests

Need golden scenarios:

- one project with:
  - internal estimate
  - client estimate
  - supplier invoice unpaid
  - supplier invoice partially paid
  - signed KB2 unpaid
  - client payment received

Assertions:

- budget totals
- payable totals
- receivable totals
- cash totals
- margin forecast

## Operational Rollout Plan

### Stage 1. Dev

- schema change
- new field write support
- dry-run backfill
- v2 readers hidden

### Stage 2. Staging Copy of Production

- restore production snapshot
- run full backfill
- compare totals
- run end-to-end workflows

### Stage 3. Production Shadow Mode

- deploy schema + write support
- old readers still active
- new `financeNature` populated
- admin-only diagnostics compare old/new

### Stage 4. Partial Reader Switch

- switch supplier debt first
- then cashflow
- then budget matrix
- then owner dashboard

### Stage 5. Writer Switches

- invoice import
- supplier payments
- KB2
- estimates
- foreman reports
- stage auto

### Stage 6. Cleanup

- deprecate misleading fact semantics in UI labels
- mark legacy paths

## Required Diagnostics to Build Before Migration

1. Finance semantic audit page.

Must show:

- counts by `source`
- counts by `kind/type/status`
- counts by `financeNature`
- rows with null `financeNature`
- `FACT` rows by source

2. Debt reconciliation report.

Must compare:

- raw unpaid sums
- outstanding after allocations
- per-counterparty diff

3. Budget layer conflict report.

Must show projects with:

- `ESTIMATE_AUTO` plan rows
- `STAGE_AUTO` plan rows
- both at same time

4. Workflow leakage report.

Must show:

- finance rows created from draft estimates
- stage auto-publish events
- orphan/ambiguous records

## Proposed File-Level Implementation Order

### First wave

- schema: `prisma/schema.prisma`
- DTO types:
  - [types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/financing/_components/types.ts:1)
- finance list/select serialization:
  - [queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/queries.ts:1)

### Second wave

- debt readers:
  - [owner/queries.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/owner/queries.ts:1)
  - [supplier-debts route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/supplier-debts/route.ts:1)

### Third wave

- cashflow:
  - [cashflow.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/cashflow.ts:1)
- budget matrix:
  - [budget-matrix.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/budget-matrix.ts:1)

### Fourth wave

- invoice import:
  - [import-invoices commit route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/financing/import-invoices/commit/route.ts:1)
- supplier payment APIs:
  - [supplier-payments route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/financing/supplier-payments/route.ts:1)
  - [supplier-allocation.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/finance/supplier-allocation.ts:1)

### Fifth wave

- estimate finance publication:
  - [sync-from-estimate.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/sync-from-estimate.ts:1)
  - [create-pair route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/create-pair/route.ts:1)
  - [estimate finance route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/[id]/finance/route.ts:1)

### Sixth wave

- KB2:
  - [kb2-service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/financing/kb2-service.ts:1)

### Seventh wave

- foreman reports:
  - [approve foreman report route](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/foreman-reports/[id]/approve/route.ts:1)

### Eighth wave

- stage accounting semantics:
  - [stage-auto-finance.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/stage-auto-finance.ts:1)
  - [sync-estimate-to-stages.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/sync-estimate-to-stages.ts:1)

## Hard No-Go Rules

Do not do the following:

1. Do not rename `PLAN` / `FACT` enums as the first step.
2. Do not bulk-rewrite historical records without a dry-run diff.
3. Do not make `STAGE_AUTO FACT` count as cash actual.
4. Do not switch all dashboards on the same deploy.
5. Do not delete legacy derived rows until reconciliation passes.
6. Do not change supplier payment allocation mechanics during semantic migration.

## Final Recommendation

The safest target is not a full ERP rewrite.

The safest target is:

- keep existing tables
- add one semantic accounting field
- classify data gradually
- migrate readers first
- migrate writers second
- preserve settlement mechanics

This minimizes blast radius and lets the team compare old and new numbers before committing to the new model.

## Immediate Next Steps

1. Approve target classification vocabulary:
   `BUDGET / COMMITMENT / ACTUAL` or explicit `financeNature`.

2. Build the audit report from Phase 0 before any schema change.

3. Decide one unresolved business rule:
   what a foreman-approved expense means in accounting:
   `COMMITTED_EXPENSE` or `ACTUAL_EXPENSE`.

4. Disable draft estimate auto-sync into finance behind a feature flag.

5. Implement the schema addition and v2 diagnostics only.

Only after these five steps should data migration begin.
