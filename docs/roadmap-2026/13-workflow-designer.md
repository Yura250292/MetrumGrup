# Task 13 — Workflow Designer (No-code Automation Builder)

> **Priority:** 🟢 NICE-TO-HAVE | **Estimate:** 5 тижнів | **Owner:** ___
> **Спрінт:** після стабілізації EventBus / сервіс-шару

---

## Mission

Дати адмінам Metrum Group візуальний редактор для побудови автоматизацій без коду:
**"коли X сталося → з умовами Y → виконати Z"**.

Замість того щоб кожну нову автоматизацію код-программіст вшивав у service-layer, бізнес-користувач (MANAGER / SUPER_ADMIN) у браузері перетягує ноди: тригер → умови → дії, і автоматизація запускається в проді через secondes.

Кінцева ціль — 80% типових повторюваних бізнес-сценаріїв конфігуруються через UI, без релізу коду.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Anthropic + Gemini, Jest.
**Канонічна UI:** `src/app/admin-v2/*`.
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Workflows — per-firm.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT.
**Notifications:** `src/lib/notifications/` — multi-channel (in-app + Telegram).
**Telegram bot:** `bot/` — окремий процес.

**Передумова:** треба EventBus у monolith. Зараз доменні події публікуються point-to-point (наприклад, `ForemanReport.status = APPROVED` → код прямо створює `FinanceEntry`). Для workflows потрібен брокер усередині сервіс-шару.

---

## Business Goal

**Перевести типові сценарії з коду в config.** Це знімає bottleneck "програміст пише новий if".

**Приклади сценаріїв, що зараз hardcoded:**
- ForemanReport `APPROVED` → створити FinanceEntry → notify accountant.
- RFI з `dueAt < now + 20%` → escalate до PM.
- Task assigned до User → push notification + Telegram.
- Equipment `nextMaintenanceAt < now + 7d` → створити Task для механіка.
- Project budget overrun > 10% → email SUPER_ADMIN.

**Метрики успіху:**
- ≥10 виробничих workflows активні протягом місяця після релізу
- Час від ідеї до запуску workflow — <30 хв (без втручання розробника)
- 95% executions завершуються `SUCCESS` за <5 сек (для non-AI actions)
- Жодного infinite-loop у проді (тести + guards)

---

## Out of Scope

- ❌ Marketplace community-workflows (наступна ітерація)
- ❌ Code-blocks (custom JS у нодах) — security risk, тільки whitelisted actions
- ❌ Multi-firm cross-firm workflows (workflow завжди в межах однієї firmId)
- ❌ AI-generated workflows ("опиши що тобі треба → AI збирає графф") — phase 2
- ❌ Real-time visual debugger (тільки post-execution log)

---

## Prerequisites

- [ ] **EventBus** — узгодити вибір: in-memory + Prisma middleware ↔ pg-boss (PostgreSQL job queue) ↔ окремий Redis + BullMQ. Рекомендація: `pg-boss` (PostgreSQL-backed, без додаткової інфраструктури, transactional).
- [ ] **React Flow** vs alternatives (Reactflow, Drawflow, n8n-style canvas). Рекомендація: `@xyflow/react` (mature, MIT, добре документований).
- [ ] **Узгодити whitelist моделей** для тригерів `model.created/updated` (не всі — наприклад, AuditLog не тригерить).
- [ ] **Узгодити квоту:** скільки активних workflows per-firm на старті (рекомендую 50).
- [ ] **Узгодити sandboxing:** які action-и можуть викликати один одного (запобігти fork-bomb).

---

## 🚨 Parallel Conflicts

| Файл                                          | Конфлікт з           | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                        | **усі task-и**       | 🔴 серіалізувати       |
| `src/app/admin-v2/_lib/nav.ts`                | 02, 03, 12, 14       | 🔴 серіалізувати       |
| `src/lib/prisma.ts` (middleware hooks)        | усі сервісні task-и  | 🔴 серіалізувати       |
| `src/lib/notifications/dispatch.ts`           | 12, 15               | 🟡 розширити channels  |
| `src/lib/foreman/reports/approve.ts`          | 03, 10               | 🟡 додати event emit   |
| `src/lib/financing/entries.ts`                | 01, 02               | 🟡 додати event emit   |
| `src/app/admin-v2/settings/workflows/*`       | нові — без конфлікту | 🟢                     |
| `src/lib/workflows/*`                         | нові — без конфлікту | 🟢                     |
| `package.json` (нові deps: `@xyflow/react`, `pg-boss`) | усі         | 🟡 додавати одночасно  |

---

## Data Model (Prisma)

```prisma
enum WorkflowTriggerType {
  MODEL_CREATED
  MODEL_UPDATED
  STATUS_CHANGED
  DEADLINE_APPROACHING
  FIELD_CROSSED_THRESHOLD
  SCHEDULE_CRON
}

enum WorkflowActionType {
  RECORD_CREATE
  RECORD_UPDATE
  NOTIFICATION_SEND
  CHAT_POST
  EMAIL_SEND
  AI_RUN_PROMPT
}

enum WorkflowExecutionStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  RETRYING
  DEAD_LETTER
}

model WorkflowDefinition {
  id              String              @id @default(cuid())
  firmId          String                                                // ✅ multi-firm
  name            String
  description     String?             @db.Text
  isActive        Boolean             @default(false)                   // створюється OFF, активується вручну
  version         Int                 @default(1)
  trigger         Json                                                  // { type, params }
  conditions      Json                                                  // { op: AND|OR, rules: [{ field, op, value }, ...] }
  actions         Json                                                  // [{ type, params, retryPolicy }, ...]
  runCount        Int                 @default(0)
  successCount    Int                 @default(0)
  failureCount    Int                 @default(0)
  lastRunAt       DateTime?
  lastRunStatus   WorkflowExecutionStatus?
  createdById     String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  // Захист від нескінченного рекурсивного спрацювання
  maxDepth        Int                 @default(3)                       // макс глибина "workflow тригерить інший workflow"
  rateLimitPerHr  Int                 @default(1000)

  firm            Firm                @relation(fields: [firmId], references: [id])
  createdBy       User                @relation(fields: [createdById], references: [id])
  executions      WorkflowExecution[]

  @@index([firmId, isActive])
  @@index([firmId, name])
}

model WorkflowExecution {
  id                      String                  @id @default(cuid())
  workflowDefinitionId    String
  triggeredAt             DateTime                @default(now())
  triggerPayload          Json                                          // snapshot тригер-події
  triggerSource           String?                                       // e.g. "ForemanReport:cuid-xxx" — для traceability
  status                  WorkflowExecutionStatus
  startedAt               DateTime?
  finishedAt              DateTime?
  ms                      Int?                                          // тривалість виконання
  actionResults           Json?                                         // [{ actionIdx, status, output, ms, error? }]
  error                   String?                 @db.Text
  attempts                Int                     @default(0)
  depth                   Int                     @default(0)           // для loop-detection (chain-of-workflows)
  parentExecutionId       String?                                       // якщо тригернутий іншим workflow

  workflow                WorkflowDefinition      @relation(fields: [workflowDefinitionId], references: [id], onDelete: Cascade)
  parentExecution         WorkflowExecution?      @relation("ExecutionChain", fields: [parentExecutionId], references: [id])
  childExecutions         WorkflowExecution[]     @relation("ExecutionChain")

  @@index([workflowDefinitionId, triggeredAt])
  @@index([status, triggeredAt])
  @@index([parentExecutionId])
}

model WorkflowTemplate {
  id              String   @id @default(cuid())
  name            String
  description     String   @db.Text
  category        String                                                // "Foreman", "Finance", "RFI", "Equipment"
  definition      Json                                                  // { trigger, conditions, actions }
  iconKey         String?                                               // lucide icon name
  isSystem        Boolean  @default(true)                               // системний vs user-created
  usageCount      Int      @default(0)
  createdAt       DateTime @default(now())

  @@index([category])
}

// Опційно: якщо pg-boss задіємо — таблиці створюються самим pg-boss у власній schema "pgboss"
```

---

## Migration Strategy

1. Локально `prisma migrate dev --name add_workflow_engine --create-only`, перевірити SQL.
2. **Окремо:** `pg-boss` створює свою schema автоматично — додати `pg-boss schema deploy` як bootstrap step у `src/lib/workflows/queue.ts`.
3. Production: `prisma migrate deploy`. На першому деплої — system-templates seed.
4. **EventBus rollout:** додавати event-emits у service-layer поступово, починаючи з `ForemanReport.approve` (найбільш потрібний кейс).

---

## API Endpoints

```
# Definitions
GET    /api/admin/workflows                          # list per firm
POST   /api/admin/workflows                          # create (isActive=false)
GET    /api/admin/workflows/:id
PATCH  /api/admin/workflows/:id                      # update (bumps version)
DELETE /api/admin/workflows/:id                      # SUPER_ADMIN only
POST   /api/admin/workflows/:id/activate
POST   /api/admin/workflows/:id/deactivate
POST   /api/admin/workflows/:id/test                 # dry-run з sample payload

# Executions
GET    /api/admin/workflows/:id/executions           # last 200, з фільтром по status
GET    /api/admin/workflows/executions/:execId       # деталка з actionResults
POST   /api/admin/workflows/executions/:execId/retry # manual retry

# Templates
GET    /api/admin/workflows/templates                # marketplace builtin
POST   /api/admin/workflows/templates/:tplId/clone   # clone у user-workflow

# Metadata (для UI builder)
GET    /api/admin/workflows/meta/models              # whitelisted models для тригерів
GET    /api/admin/workflows/meta/fields/:model       # доступні fields для conditions
GET    /api/admin/workflows/meta/actions             # доступні action types з schema
```

RBAC:
- create/update/delete workflows: `SUPER_ADMIN` + `MANAGER`
- view executions: те саме
- activate/deactivate: `SUPER_ADMIN` only (safety)

---

## UI Changes

### `src/app/admin-v2/settings/workflows/`

```
src/app/admin-v2/settings/workflows/
  page.tsx                              # список workflows + статистика
  new/page.tsx                          # вибір template або blank
  [id]/
    page.tsx                            # canvas-editor (React Flow)
    executions/page.tsx                 # log виконань
    executions/[execId]/page.tsx        # деталка execution з action-by-action
  templates/page.tsx                    # marketplace
```

### Visual editor (React Flow)

- Ноди:
  - **Trigger Node** (зелений) — один на workflow, тип з dropdown.
  - **Condition Node** (жовтий) — AND/OR group з rules.
  - **Action Node** (синій) — type + params (form динамічно за action schema).
  - **End Node** (сірий) — implicit, опційно показуємо для clarity.
- Edges: simple bezier, label = "якщо true / якщо false" для condition forks.
- Sidebar: список доступних nodes для drag-and-drop.
- Toolbar: Save (autosave з debounce 2s), Test (dry-run), Activate.
- Validation badge: червона якщо граф невалідний (несполучені ноди / цикл / порожній trigger).

### Компоненти

- `src/components/workflows/CanvasEditor.tsx` — wrapper навколо ReactFlow з custom nodes.
- `src/components/workflows/TriggerNode.tsx`, `ConditionNode.tsx`, `ActionNode.tsx` — кастомні nodes.
- `src/components/workflows/ActionParamsForm.tsx` — динамічна форма за JSON-schema action-у.
- `src/components/workflows/ExecutionTimeline.tsx` — vertical timeline action-by-action з тривалістю/output/error.
- `src/components/workflows/TemplateGallery.tsx` — grid templates з категоріями.

### Навігація

`src/app/admin-v2/_lib/nav.ts`: під "Налаштування" → "Workflows" (icon: Workflow), видимий SUPER_ADMIN + MANAGER.

---

## Engine (детально)

### `src/lib/workflows/`

```
src/lib/workflows/
  engine.ts                             # головна orchestration: subscribe → match → evaluate → execute
  queue.ts                              # pg-boss wrapper
  event-bus.ts                          # in-process pub/sub + persist у WorkflowExecution
  triggers/
    model.ts                            # MODEL_CREATED, MODEL_UPDATED (через Prisma middleware)
    status.ts                           # STATUS_CHANGED
    deadline.ts                         # DEADLINE_APPROACHING (cron-driven, hourly scan)
    threshold.ts                        # FIELD_CROSSED_THRESHOLD
    cron.ts                             # SCHEDULE_CRON
  conditions/
    evaluator.ts                        # safe JSON-rules evaluator (jsonata або власний)
  actions/
    record-create.ts
    record-update.ts
    notification-send.ts
    chat-post.ts
    email-send.ts
    ai-run-prompt.ts
  guards/
    loop-detector.ts                    # max depth + rate limit
    sandbox.ts                          # try/catch wrapper, timeout, max payload size
  templates/
    seed.ts                             # 10 builtin templates
  __tests__/
    engine.test.ts
    trigger-matching.test.ts
    condition-evaluator.test.ts
    actions-isolation.test.ts
    loop-detector.test.ts
    retry-logic.test.ts
```

### Flow

1. **Подія публікується** (наприклад, `ForemanReport.approve()` викликає `eventBus.emit('foremanReport.updated', { id, before, after })`).
2. **Engine** підписаний на всі типи подій. Знаходить активні `WorkflowDefinition` де `trigger.type` матчиться + `trigger.params` (model/field/etc.) збігаються + firmId збігається.
3. **Conditions** — оцінює JSON-rules проти payload.
4. **Queue** — пакує `WorkflowExecution(status=QUEUED)` у pg-boss queue `workflow-exec`.
5. **Worker** (`src/lib/workflows/worker.ts`) піднімає job, виконує actions послідовно, пише `actionResults`.
6. **Retry policy** на action level: 3 attempts з exponential backoff (1s, 4s, 16s). Після — `DEAD_LETTER` → alert SUPER_ADMIN.
7. **Loop guard:** якщо action створює новий запис що тригерить workflow → `depth+1`. Якщо `depth > maxDepth` (3) — execution `FAILED` з error "loop detected".
8. **Rate limit:** якщо `WorkflowDefinition.runCount` за останню годину > `rateLimitPerHr` — skip + alert.

### Trigger Hooks (інтеграція)

Замість Prisma middleware (фрагіл при transactions) — **service-layer events**. Кожен service у `src/lib/foreman/`, `src/lib/financing/`, etc. після mutation викликає:
```ts
import { eventBus } from '@/lib/workflows/event-bus';
await eventBus.emit('foremanReport.statusChanged', { id, from, to, firmId, userId });
```

Список point-ів до інструментації (для першого релізу):
- `ForemanReport.approve/reject` (status changed)
- `FinanceEntry.create/update`
- `Task.create/assign/complete`
- `RFI.create/respond/close`
- `Project.statusChange`
- `EmployeePayrollPeriod.create`

### Sandbox safety

- Кожна action exec у Promise.race з timeout 30s (для AI — 120s).
- Max payload size: 1MB per action input.
- Whitelist of writable models: тільки domain models, **НІ** AuditLog, User.password, etc.
- Audit trail: кожна action exec логується з before/after diff.

---

## Builtin Templates (seed — 10 штук)

1. **Foreman report → Finance entry** — `ForemanReport.status = APPROVED` → `RECORD_CREATE FinanceEntry(kind=FACT)` → `NOTIFICATION_SEND accountant`.
2. **RFI overdue escalation** — `RFI.dueAt < now + 20%` AND `status != CLOSED` → `NOTIFICATION_SEND projectManager`.
3. **Equipment maintenance due** — `Equipment.nextMaintenanceAt < now + 7d` → `RECORD_CREATE Task(assignTo=mechanic)`.
4. **Budget overrun alert** — `Project.factCost > budget * 1.1` → `EMAIL_SEND superAdmin`.
5. **New task assigned → Telegram push** — `Task.created` AND `assigneeId != null` → `NOTIFICATION_SEND assignee(channel=telegram)`.
6. **DM mention → push** — `ChatMessage.created` AND `mentions.length > 0` → `NOTIFICATION_SEND mentioned`.
7. **HR онбординг** — `User.created` AND `role = ENGINEER` → `RECORD_CREATE Task(title="Видати СІЗ")`.
8. **Daily stand-up reminder** — `SCHEDULE_CRON "0 9 * * 1-5"` → `CHAT_POST roomId=team`.
9. **Weekly KPI digest** — `SCHEDULE_CRON "0 18 * * 5"` → `AI_RUN_PROMPT` → `EMAIL_SEND superAdmin`.
10. **Cost code missing** — `FinanceEntry.created` AND `costCodeId IS NULL` → `NOTIFICATION_SEND author "Додайте cost code"`.

---

## Implementation Plan

1. **Узгодити open questions** (engine choice, model whitelist).
2. **Dependency install:** `@xyflow/react`, `pg-boss`, `jsonata` (для condition eval).
3. **Prisma schema:** додати enums + 3 моделі + extensions, локальний `migrate dev`.
4. **`src/lib/workflows/event-bus.ts`** — in-process EventEmitter + типізовані події.
5. **`src/lib/workflows/queue.ts`** — pg-boss wrapper з singleton init.
6. **`src/lib/workflows/engine.ts`** — основна логіка subscribe → match → evaluate → enqueue.
7. **`src/lib/workflows/worker.ts`** — окремий процес `npm run workflows:worker` (як bot).
8. **Triggers:** реалізувати 6 типів (model, status, deadline, threshold, cron).
9. **Actions:** реалізувати 6 типів з валідацією params.
10. **Conditions evaluator** на `jsonata` або власний AST-walker.
11. **Guards:** loop-detector, rate-limit, sandbox-wrapper.
12. **Інструментація service-layer:** 6 ключових мутацій emit-ять events (через PR на існуючі файли).
13. **API endpoints** (12 routes) з firm-scope + RBAC.
14. **Seed templates** — 10 builtin (`scripts/seed-workflow-templates.ts`).
15. **UI: список + редактор (React Flow)** з custom nodes.
16. **UI: executions log + retry** з timeline-візуалізацією.
17. **UI: template gallery** + clone flow.
18. **Tests** (8+ test files): engine, triggers, conditions, actions, loop, retry, rate-limit, firm-isolation.
19. **Documentation:** `docs/workflows/USER_GUIDE.md` для бізнес-користувача (як зібрати свою автоматизацію).
20. **Operational runbook:** як моніторити, як debug-ити failures, як вимкнути runaway workflow.

---

## Acceptance Criteria

- [ ] MANAGER створює workflow з template за <2 хв, активує, бачить виконання в логах через секунди.
- [ ] Recursive workflow (workflow тригерить workflow тригерить workflow → loop) — execution `FAILED` з "loop detected" на 4-й глибині.
- [ ] При rate-limit overflow workflow auto-deactivates + alert SUPER_ADMIN.
- [ ] Studio user не бачить і не може запустити Group workflows (firm-isolation тест зелений).
- [ ] Кожна failed execution має `error` + `actionResults[idx].error` (не "Internal error").
- [ ] Retry exponential backoff працює (3 attempts, 1s/4s/16s).
- [ ] Action timeout 30s (120s для AI) — не вішає worker.
- [ ] Dry-run (`POST /test`) виконує conditions + actions у sandbox (нічого не комітить).
- [ ] Visual editor зберігає граф з autosave (debounce 2s), при reload показує без втрат.
- [ ] Усі 10 builtin templates запускаються з тестового payload без помилок.

---

## Testing

- `src/lib/workflows/__tests__/engine.test.ts` — subscribe → match → enqueue.
- `src/lib/workflows/__tests__/trigger-matching.test.ts` — usі 6 типів тригерів матчаться як треба.
- `src/lib/workflows/__tests__/condition-evaluator.test.ts` — AND/OR/nested groups.
- `src/lib/workflows/__tests__/actions-isolation.test.ts` — action exception не валить worker.
- `src/lib/workflows/__tests__/loop-detector.test.ts` — execution `depth > maxDepth` → FAILED.
- `src/lib/workflows/__tests__/retry-logic.test.ts` — exponential backoff timing.
- `src/lib/workflows/__tests__/rate-limit.test.ts` — auto-deactivate при overflow.
- `src/lib/workflows/__tests__/firm-isolation.test.ts` — Studio workflow не бачить Group подій.
- `src/lib/workflows/__tests__/sandbox.test.ts` — timeout + payload size guards.
- `src/components/workflows/__tests__/CanvasEditor.test.tsx` — drag-drop ноди, save.

Run: `npm run test:unit -- workflows`

---

## Open Questions

1. **Engine:** pg-boss vs BullMQ vs in-memory? Рекомендація: pg-boss (PostgreSQL-backed, без Redis, transactional з основною БД).
2. **Condition evaluator:** jsonata (потужний, але overkill) vs власний AST з whitelist operators? Рекомендація: власний (security + просто).
3. **Worker процес:** окремий `npm run workflows:worker` чи частина `npm run bot:dev`? Рекомендація: окремий (різні failure modes).
4. **Як ховати чутливі дані** в action params (наприклад, API keys для AI)? Рекомендація: secrets stored через `firm-settings`, у workflow посилаємось по key.
5. **UI: чи дозволити "branching"** (умова → два path)? Phase 1 — лінійно (linear chain), phase 2 — branches.
6. **Versioning workflows:** редагування активного workflow — повинно створити нову версію? Рекомендація: так, історія через `version++` + immutable JSON snapshot у виконаннях.

---

## References

**Бібліотеки:**
- [React Flow / @xyflow/react](https://reactflow.dev/) — visual node editor
- [pg-boss](https://github.com/timgit/pg-boss) — PostgreSQL job queue
- [jsonata](https://jsonata.org/) — JSON query language (опційно)
- [n8n.io](https://docs.n8n.io/) — UX reference для no-code automation
- [Zapier](https://zapier.com/), [Make.com](https://www.make.com/) — UX reference

**Внутрішні файли:**
- `src/lib/firm/scope.ts` — firm scoping helper
- `src/lib/notifications/dispatch.ts` — multi-channel notify
- `src/lib/prisma.ts` — Prisma client + middleware
- `bot/agent/` — pattern для worker processes
