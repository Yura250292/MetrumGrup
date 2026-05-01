# ADR 0001 — Канонічне джерело плану в звʼязці «Фінансування ↔ Проєкти»

**Статус:** Прийнято
**Дата:** 2026-05-01
**Контекст:** Реалізація Phases 1, 2, 4, 5, 6 з [FINANCING_PROJECTS_INTEGRATION_IMPROVEMENT_PLAN.md](../FINANCING_PROJECTS_INTEGRATION_IMPROVEMENT_PLAN.md)

---

## Проблема

До цього рішення планові цифри проєкту жили одночасно у кількох місцях:
`Project.totalBudget` (rollup), `EstimateItem.amount` (кошторис),
`ProjectStageRecord.allocatedBudget`/`planVolume*planUnitPrice`,
`FinanceEntry(source=PROJECT_BUDGET)` (rollup-копія в фінансовому журналі),
`FinanceEntry(source=ESTIMATE_AUTO)` (per-item з кошторису),
`FinanceEntry(source=STAGE_AUTO)` (per-stage). Різні екрани показували різні
суми за тим самим бізнес-питанням, ручні sync-залежності створювали
напівсинхронні стани, repair-логіка нормалізувала продакшн-дані як
рутина, а не як safety-net.

## Рішення

Прийнято **layered model: один canonical source + кешований rollup +
materialized projection**.

### Ієрархія шарів

```
ProjectStageRecord (planVolume, planUnitPrice, planClientUnitPrice)
       │  canonical layer плану виконання
       ▼
FinanceEntry(source=STAGE_AUTO, isDerived=true)
       │  materialized projection для журналу/звітності
       ▼
Project.planSource ∈ {NONE, ESTIMATE, STAGE}
       │  явний прапор canonical-стану на проєкті
       ▼
Project.totalBudget + FinanceEntry(source=PROJECT_BUDGET, isDerived=true)
       │  rollup-кеш; НЕ використовується у summary, якщо planSource ≠ NONE
```

### Правила

1. **Stage tree — canonical для плану.** Якщо у проєкту є хоч один
   `ProjectStageRecord` з `planVolume > 0` → `Project.planSource = STAGE`.
2. **`PROJECT_BUDGET` — лише fallback.** `computeSummary` виключає його з
   агрегації для проєктів з `planSource IN (ESTIMATE, STAGE)` і для orphan-
   записів (`projectId = null`). Для проєктів з `planSource = NONE` rollup
   лишається — це єдине джерело плану.
3. **`isDerived = true` ⇒ read-only на бізнес-полях.** PATCH дозволяє
   тільки `status / isArchived / remindAt / attachments`. Сума, категорія,
   проєкт, дата — змінюються через канонічне джерело (stage / estimate /
   `Project.totalBudget`).
4. **`firmId` обовʼязковий, якщо є `projectId`.** Інакше summary по фірмі
   розʼїжджається з агрегатами по проєктах.
5. **Test-проєкти не пишуть у фінансування.** Симетрично на write-side
   (POST/PATCH FinanceEntry) і на sync-flow (`syncProjectBudgetEntry`,
   `syncStageAutoFinanceEntries`).
6. **`recomputeProjectPlanSource` — auto-call на всіх write-paths.**
   `syncEstimateToStages`, `syncStageAutoFinanceEntries`, legacy
   `syncEstimateToFinancing`. Ідемпотентний, no-op якщо стан не
   змінився.

### Інваріанти `FinanceEntry`

- якщо є `stageRecordId`, то `stageRecord.projectId === entry.projectId`;
- якщо є `projectId`, то `entry.firmId === project.firmId` (NOT NULL);
- якщо запис у mirror-папці проєкту, `projectId` auto-stamp з mirror;
- counterparty має ту саму `firmId`, що й запис.

Усі перевірки — у [`validateProjectForFinanceWrite`](../src/lib/financing/project-invariants.ts), єдина точка істини.

### RBAC

Спільний policy layer [`src/lib/financing/rbac.ts`](../src/lib/financing/rbac.ts):

| Дія | Допустимі ролі |
|---|---|
| READ (журнал, summary) | SUPER_ADMIN, MANAGER, FINANCIER, ENGINEER |
| WRITE (MANUAL FinanceEntry) | SUPER_ADMIN, MANAGER, FINANCIER |
| PUBLISH (sync estimate→stages, sync-stages-finance) | SUPER_ADMIN, MANAGER, FINANCIER |
| DIAGNOSTICS (health, repair) | SUPER_ADMIN, MANAGER, FINANCIER |
| HARD_DELETE | SUPER_ADMIN |

Спеціалізовані scope-и (timesheets з HR, counterparties, payroll)
зберігають власні масиви — у них окрема business-логіка доступу.

## Що було зроблено

| Phase | Pull | Migration |
|---|---|---|
| 1 (Quick wins) | exclusion STAGE_AUTO у summary, інваріанти POST/PATCH FinanceEntry, helper `validateProjectForFinanceWrite`, 8 тестів | — |
| 2 (canonical source) | enum `ProjectPlanSource`, поле `Project.planSource`, helper `recomputeProjectPlanSource`, refactor `computeSummary` | `20260501_project_plan_source` |
| 4.1 (derived dates) | `STAGE_AUTO.occurredAt` з `stage.startDate / project.startDate` замість `now()` | — |
| 4.2 (categorization) | `categorizeStage(stage, type)` помаповує EXPENSE/INCOME на валідні категорії + costType; backfill існуючих | `20260501_stage_auto_categorize` |
| 4.3 (derived flag) | `FinanceEntry.isDerived` boolean, wired у всіх derived-writers, expose в API | `20260501_finance_entry_is_derived` |
| 4.4 (edit policy) | Read-only бізнес-полів на всіх derived записах (раніше — лише ESTIMATE_AUTO) | — |
| 5 (RBAC) | `src/lib/financing/rbac.ts` — спільні `canRead/Write/Publish/Diagnostics/HardDelete` helpers | — |
| 6.2 (observability) | `GET /api/admin/finance-diagnostics/health` + `/admin-v2/financing/diagnostics` UI | — |

## Що залишилось (поза цим ADR)

- **Phase 3 (sync redesign)** — auto-projection або draft/published model.
  Потребує UX-рішень: чи зберігати кнопку «Зберегти у фінансування» як
  явний publish action, чи робити dirty-state з auto-sync. Не зроблено.
- **Phase 6.1 (audit dashboard)** — окрема сторінка з історією sync-операцій,
  останні `lastProjectedAt`. Не зроблено.

## Наслідки

**Позитивні:**
- одна точка істини (`Project.planSource`) для всіх dashboard/report;
- `validateProjectForFinanceWrite` — стійкі інваріанти на write;
- repair-логіка переходить у safety-net замість регулярного інструмента;
- derived-шар явно read-only — менше випадкових ручних правок.

**Ризики:**
- `recomputeProjectPlanSource` має викликатися на всіх write-paths.
  Якщо новий writer створить ESTIMATE_AUTO/STAGE_AUTO напряму через
  raw SQL — `planSource` залишиться застарілим. Mitigation: код-ревʼю,
  health endpoint показує duplicate plan layers.
- Зміна правил summary (Phase 1: STAGE_AUTO exclusion) могла знизити
  показники у проєктах із подвоєним обліком — це **виправлення**, не
  регресія, але користувачі побачать «менші» цифри.

## Посилання на код

- [`src/lib/financing/queries.ts`](../src/lib/financing/queries.ts) — `computeSummary`, `FINANCE_ENTRY_SELECT`
- [`src/lib/financing/project-invariants.ts`](../src/lib/financing/project-invariants.ts) — write-side invariants
- [`src/lib/financing/rbac.ts`](../src/lib/financing/rbac.ts) — policy layer
- [`src/lib/projects/plan-source.ts`](../src/lib/projects/plan-source.ts) — recompute helper
- [`src/lib/projects/stage-auto-finance.ts`](../src/lib/projects/stage-auto-finance.ts) — STAGE_AUTO writer
- [`src/lib/projects/stage-finance-categorization.ts`](../src/lib/projects/stage-finance-categorization.ts) — стейдж→category mapping
- [`src/app/api/admin/finance-diagnostics/health/route.ts`](../src/app/api/admin/finance-diagnostics/health/route.ts) — health-counters API
- [`src/app/admin-v2/financing/diagnostics/page.tsx`](../src/app/admin-v2/financing/diagnostics/page.tsx) — health UI
