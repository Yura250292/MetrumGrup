# Task 05 — Gantt + Critical Path

> Priority: 🔴 MUST-HAVE | Estimate: 5-6 тижнів | Owner: ___

## Mission

Додати справжню Gantt-діаграму у view "Мої задачі" та у проєктний tab "Задачі". Підтримати залежності (FS/SS/FF/SF + lag — уже у моделі), розрахунок критичного шляху (CPM), baseline (план vs факт), resource diagram з виявленням перевантажень. SVG-based власна реалізація (НЕ Canvas — для accessibility й експорту), drag-resize смужок для зміни дат. Export у MS Project XML 2003 для замовників, що звикли до Microsoft Project.

## Context

- `Task` модель уже існує (`prisma/schema.prisma:2076-2125`) з полями `startDate, dueDate, completedAt, estimatedHours, actualHours, position`.
- `TaskDependency` модель уже існує (`prisma/schema.prisma:2293-2307`) з повним enum `TaskDependencyType { FS, SS, FF, SF }` і `lagDays Int @default(0)`. **Нічого не створюємо — лише розширюємо логіку.**
- `TaskViewType` enum уже має `GANTT` (`prisma/schema.prisma:2316-2322`) — задумано, але не реалізовано.
- Реалізована Me-dashboard у `src/app/admin-v2/me/_components/me-dashboard.tsx` з `ViewMode = "sections" | "table"` (`use-me-tasks.ts:96`). Додаємо третій mode `"gantt"`.
- Реалізована вкладка задач проєкту: треба знайти у `src/app/admin-v2/projects/[id]/_components/` (tab-tasks).
- Stack: Next.js 15, React 19, Tailwind v4. Без важких deps — SVG руками; `date-fns` (вже є) для дат.
- Multi-firm: Task уже firm-scoped через Project; жодних schema-змін для firm.

## Business Goal

CRM показує задачі у списку/Kanban, але CEO/інвестор хоче побачити "коли почнеться фундамент і коли закінчиться покрівля". Без Gantt — це Excel. З Gantt + critical path — це ризик-менеджмент: "якщо опалубка зсувається на 3 дні, що ще зсувається разом з нею?".

Метрика:
- **100% активних проєктів мають Gantt baseline** через 8 тижнів після запуску.
- **Час підготовки тижневого звіту CEO ↓ з 4 год до 30 хв** (auto-screenshot Gantt + критичний шлях).
- **Slip detection**: якщо актуальна тривалість > baseline на 20% → автоматичний alert CEO/PM.

## Out of Scope

- Resource leveling (auto-reschedule для усунення overload) — складна оптимізація, окремий task.
- Multi-project Gantt (program portfolio view) — спочатку per-project + per-user. Programme view — v2.
- Webhooks для зовнішніх Gantt-tools (Monday.com, Asana) — окремо.
- Real-time collaborative editing (один drag, всі бачать) — поки тільки optimistic local + WebSocket invalidation. CRDT — окремо.
- MS Project XML import — тільки export.
- Commercial bundle dhtmlx-gantt ($799) — НЕ використовуємо (vendor lock-in, мало гнучкості з firmId scoping).

## Prerequisites

- [ ] Задача 03 і 04 — конфлікт по `prisma/schema.prisma`; серіалізувати 03 → 04 → 05.
- [ ] Питання користувачу: робочий тиждень = 5 чи 6 днів? (вплине на CPM duration calc — пропускати чи рахувати вихідні)
- [ ] Питання користувачу: чи треба підтримати свята (Україна) для CPM — додатковий enum/seed?
- [ ] Питання користувачу: яка політика округлення тривалості (днів) — round half-up чи ceiling? Стандарт MS Project — ceiling.
- [ ] Перевірити, чи в проєкті є компонент Tabs з accessibility (для tab "Gantt") — інакше використати наш у `admin-v2/_components/ui/`.

## 🚨 Parallel Conflicts

Цей task редагує:
- `prisma/schema.prisma:2076-2125` (Task — ALTER ADD 4 columns). **КОНФЛІКТ із 03 і 04**. Серіалізувати останнім.
- `src/app/admin-v2/me/_components/me-dashboard.tsx` — додаємо третій ViewMode.
- `src/app/admin-v2/me/_components/use-me-tasks.ts:96` — `ViewMode` type union.
- `src/app/admin-v2/projects/[id]/_components/tab-tasks.tsx` — toggle Gantt/List.
- `src/app/admin-v2/_lib/nav.ts` — додаємо shortcut "Gantt усього проєкту" (опц.). **Конфлікт з усіма nav-міняючими**.
- `src/lib/constants.ts` — додаємо `DEPENDENCY_TYPE_LABELS`.
- НЕ чіпаємо `src/lib/financing/*` і `src/lib/estimates/*` (DO NOT touch у CLAUDE.md).

## Data Model (Prisma)

Розширення `Task` (4 ADD COLUMN, всі nullable):

```prisma
model Task {
  // ... existing fields ...
  startDate          DateTime?  // RENAME у UI як "Actual Start" (зворотна сумісність назви)
  dueDate            DateTime?  // RENAME у UI як "Actual End"
  // NEW:
  plannedStartAt     DateTime?  // baseline план
  plannedEndAt       DateTime?  // baseline план
  progressPercent    Int        @default(0) // 0..100; на UI можна autocompute = actualHours/estimatedHours*100
  baselineFrozenAt   DateTime?  // якщо != null → baseline зафіксовано; зміна plannedStart/End потребує "rebaseline" дії
  // ... existing rest ...

  @@index([projectId, plannedStartAt])
  // ... existing indexes ...
}
```

`TaskDependency` — БЕЗ змін, працює як є. Підтверджуємо invariants:
- унікальність `(predecessorId, successorId)` — є.
- cycle detection — НЕ enforced у БД (PG не вміє), enforce у Zod-валідаторі на API через DFS.
- self-loop (predecessor == successor) — заблокувати у валідаторі (zod refine).

```prisma
// Існує — не дублюємо в migration:
// model TaskDependency { ... type FS|SS|FF|SF, lagDays Int }
```

**Алгоритм CPM (TypeScript, не Prisma):** `src/lib/scheduling/critical-path.ts`

```ts
export interface CpmTask {
  id: string;
  durationDays: number;   // обчислюється з planned dates або estimatedHours/8
  fixedStart?: Date;      // якщо є milestone constraint
}
export interface CpmEdge {
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}
export interface CpmResult {
  earliestStart: Map<string, Date>;
  earliestFinish: Map<string, Date>;
  latestStart: Map<string, Date>;
  latestFinish: Map<string, Date>;
  slack: Map<string, number>;        // в днях
  criticalTaskIds: Set<string>;      // slack === 0
  cycleDetected: boolean;
  cyclePath?: string[];
}
export function calculateCriticalPath(
  tasks: CpmTask[],
  edges: CpmEdge[],
  projectStart: Date,
  options?: { skipWeekends?: boolean; holidays?: Date[] }
): CpmResult;
```

Алгоритм:
1. Forward pass: топологічне сортування (Kahn). При detected cycle → return `cycleDetected: true` + path.
2. Для кожної задачі обчислити ES = max з усіх predecessors з урахуванням type:
   - FS: succ.ES ≥ pred.EF + lag
   - SS: succ.ES ≥ pred.ES + lag
   - FF: succ.EF ≥ pred.EF + lag → succ.ES = succ.EF − duration
   - SF: succ.EF ≥ pred.ES + lag
3. EF = ES + duration (з врахуванням skipWeekends/holidays через `addBusinessDays`-like helper).
4. Backward pass: LF = project end (max EF серед усіх sink-задач); LS = LF − duration; для predecessors — симетрично.
5. Slack = LS − ES (у днях); critical = slack === 0.

Складність: O(V + E). Для проєкту з 500 задач і 1500 dependencies → < 50ms.

## Migration Strategy

1. `prisma migrate dev --create-only --name task_gantt_baseline` локально.
2. Тільки ADD COLUMN nullable + ADD INDEX. Жодних DROP.
3. **Backfill**: для всіх Task де `plannedStartAt IS NULL AND startDate IS NOT NULL` → `plannedStartAt = startDate`, аналогічно для end. Окремий node-скрипт `scripts/backfill-task-baseline.ts`, idempotent.
4. Production: `migrate deploy` → backfill (manual/CI).
5. **DB safety**: не використовуємо `migrate diff --shadow-database-url` проти prod (інцидент 2026-05-22).

## API Endpoints

- `GET    /api/admin/projects/:id/gantt` → `{ tasks: [...], dependencies: [...], criticalPath: { taskIds, slack }, projectStart, projectEnd }`. Heavy endpoint — кешуємо у Redis на 30 с (invalidate on Task/Dependency mutation).
- `GET    /api/admin/me/gantt?from=&to=` → персональний — задачі, де я assignee (з усіх проєктів firmId scope).
- `PUT    /api/admin/tasks/:id/dates` — body: `{ plannedStartAt?, plannedEndAt?, startDate?, dueDate? }`. Для drag-resize: optimistic UI + validation на сервері (no overlap з locked baseline якщо `baselineFrozenAt != null` без `rebaseline=true`).
- `POST   /api/admin/projects/:id/baseline/freeze` — копіює всі actual dates у planned*; ставить `baselineFrozenAt = now()`.
- `POST   /api/admin/projects/:id/baseline/clear` — `baselineFrozenAt = null`, planned* лишаються.
- `POST   /api/admin/tasks/:id/dependencies` — body: `{ predecessorId, type, lagDays }`. Server-side cycle detection (DFS) перед insert → 409 з cycle path.
- `DELETE /api/admin/tasks/:id/dependencies/:depId`
- `GET    /api/admin/projects/:id/gantt/export.xml` — Microsoft Project XML 2003 format (Content-Type: application/xml; attachment).
- `GET    /api/admin/projects/:id/gantt/resources` → resource diagram data: `{ userId, dailyLoad: [{ date, hours, overload }] }`.

## UI Changes

### Shared components

- `src/app/admin-v2/_components/gantt/GanttChart.tsx` **NEW** — головний компонент. Props: `{ tasks, dependencies, criticalPath, baseline?, mode: 'project'|'me', onTaskDateChange }`.
- `src/app/admin-v2/_components/gantt/GanttHeader.tsx` — timeline header (day/week/month zoom).
- `src/app/admin-v2/_components/gantt/GanttTaskBar.tsx` — SVG `<rect>` з drag handles (left/right resize, middle move). Підсвітка червоним якщо `criticalTaskIds.has(id)`. Baseline — півпрозора смужка `opacity-30` позаду.
- `src/app/admin-v2/_components/gantt/GanttDependencyLines.tsx` — SVG `<path>` зі стрілками між barами (FS/SS/FF/SF — різні точки кріплення).
- `src/app/admin-v2/_components/gantt/GanttWbsTree.tsx` — ліва панель з ієрархією задач (parentTaskId розкривається).
- `src/app/admin-v2/_components/gantt/GanttResourceStrip.tsx` — нижня панель з load per user/day (heatmap), red ≥ 8h.
- `src/app/admin-v2/_components/gantt/GanttToolbar.tsx` — zoom buttons, "Freeze baseline", "Export MS Project".
- `src/app/admin-v2/_components/gantt/useGanttVirtualization.ts` — virtual scroll (only render rows у viewport ± 20). Threshold: > 100 tasks.

### Інтеграція у Me dashboard

- `src/app/admin-v2/me/_components/use-me-tasks.ts:96` — `export type ViewMode = "sections" | "table" | "gantt";`
- `src/app/admin-v2/me/_components/me-dashboard.tsx` — додати кнопку "Gantt" у view-switcher і conditional render `<GanttChart mode="me" ... />`.
- `src/app/admin-v2/me/_components/gantt-view.tsx` **NEW** — wrapper, що fetch-ає `/api/admin/me/gantt` і прокидає у `<GanttChart>`.

### Інтеграція у Project tasks tab

- `src/app/admin-v2/projects/[id]/_components/tab-tasks.tsx` — додати toggle (List | Kanban | Gantt).
- `src/app/admin-v2/projects/[id]/_components/tab-tasks-gantt.tsx` **NEW** — fetch + render.

### Shared lib

- `src/lib/scheduling/critical-path.ts` **NEW** — CPM algorithm.
- `src/lib/scheduling/__tests__/critical-path.test.ts` **NEW** — 15+ test cases (відомі з PMI literature).
- `src/lib/scheduling/cycle-detect.ts` **NEW** — DFS-based, для dependency-API.
- `src/lib/scheduling/business-days.ts` **NEW** — `addBusinessDays`, `diffBusinessDays`, holidays-aware.
- `src/lib/scheduling/ms-project-xml.ts` **NEW** — серіалізатор у MSP XML 2003.
- `src/lib/scheduling/resource-load.ts` **NEW** — обчислення daily hours per assignee.
- `src/lib/constants.ts` — `DEPENDENCY_TYPE_LABELS` (`{ FS: "Закінчити→Почати", SS: ..., ... }`).

## Implementation Plan

1. [ ] **Schema migration** (день 1): 4 ADD COLUMN на Task + index.
2. [ ] **Backfill script** для planned* з existing dates (день 1, idempotent).
3. [ ] **CPM algorithm + tests** (день 2-4): пишемо TS-only, 15+ test cases (classical AOA examples з PMBOK, edge cases).
4. [ ] **Cycle detection** (день 4): окремий util, тести.
5. [ ] **Business days helper** (день 4-5): holidays-aware, default UA календар (Новий рік, Різдво, 8 березня, Великдень, Трійця, День Незалежності, День Захисників).
6. [ ] **API project gantt endpoint** (день 5-6): з Redis cache.
7. [ ] **API me gantt + dates PUT + dep CRUD** (день 6-8): cycle-detection на ввід.
8. [ ] **API export MS Project XML** (день 8-9): мінімальний XML 2003 schema (Tasks, Predecessor, BaseCalendar).
9. [ ] **GanttChart shell + WbsTree** (тиждень 2): зліва ієрархія, праворуч плейсхолдер.
10. [ ] **GanttHeader + zoom** (тиждень 2): day/week/month модального.
11. [ ] **GanttTaskBar** (тиждень 2-3): SVG, drag-resize (HTML5 DnD), tooltip.
12. [ ] **DependencyLines** (тиждень 3): path-routing для FS/SS/FF/SF (4 типи коннекторів).
13. [ ] **Critical path highlight** (тиждень 3): червона рамка + жирна лінія.
14. [ ] **Baseline overlay** (тиждень 3): півпрозора смужка позаду.
15. [ ] **ResourceStrip** (тиждень 4): heatmap, overload mark.
16. [ ] **Virtualization** (тиждень 4): for > 100 tasks.
17. [ ] **Інтеграція у Me dashboard** (тиждень 4): новий ViewMode.
18. [ ] **Інтеграція у Project tab** (тиждень 4): toggle.
19. [ ] **Export UI кнопка + download** (тиждень 5).
20. [ ] **Telegram bot нотифікація** (тиждень 5): на slip detection (actualEnd > plannedEnd + 20%) → DM PM/CEO.
21. [ ] **Tests integration + e2e** (тиждень 5).
22. [ ] **Performance benchmark** (тиждень 5): 500 tasks, 1500 deps → render ≤ 200ms TTI.
23. [ ] **Documentation + screencast** (тиждень 6): "як читати Gantt".
24. [ ] **Beta + rollout** (тиждень 6).

## Acceptance Criteria

- [ ] CPM на classical PMBOK example (8 задач) видає той самий critical path, що в підручнику. Unit-test це доводить.
- [ ] Cycle detection: dependency A→B→C→A → POST повертає 409 з `cyclePath: ['A','B','C','A']`. Тест.
- [ ] Drag правого handle на барі → PUT з новим plannedEndAt → CPM перераховує → інші бари позаду переміщуються optimistic-ally.
- [ ] Baseline freeze → редагування planned dates без `rebaseline=true` → 409. Тест.
- [ ] Multi-firm: Studio user GET /api/admin/projects/:id/gantt де project — Group → 404. Тест.
- [ ] Resource diagram: задача 16h, 1 assignee, 2 робочі дні → daily load 8h+8h, без overload. Те саме але 1 день → 16h overload (red).
- [ ] Performance: проєкт з 500 задач і 1500 deps — initial render ≤ 200 ms; зміна одного бару → re-render критичного шляху ≤ 50 ms.
- [ ] MS Project XML: відкривається у MS Project 2019+ без помилок; задачі, deps, predecessor lags — присутні.
- [ ] Accessibility: усі бари мають `<title>`, навігація стрілками + Enter → відкриває задачу. axe-lint 0 violations.
- [ ] SkipWeekends true: задача plannedStart=Пт, duration=2 дні → plannedEnd=Вт (не Нд).
- [ ] Holidays: Великдень у списку → задача через неї стрибає коректно.

## Testing

- **Unit:**
  - `critical-path.test.ts` — 15+ cases: лінійний ланцюг, паралельні гілки, merge, FS+SS+FF+SF, lag positive/negative, milestone (duration=0), пустий граф, одна задача, cycle detection.
  - `cycle-detect.test.ts` — простий cycle, складний (через 5 вузлів), self-loop, no cycle.
  - `business-days.test.ts` — Пт+1 = Пн (skipWeekends), holidays перескок, EOY rollover.
  - `ms-project-xml.test.ts` — snapshot XML для fixture з 3 задачами.
  - `resource-load.test.ts` — multi-assignee split, overload detection.
- **Integration:**
  - `api.gantt.int.test.ts` — full payload shape, firmId scope.
  - `api.dates-put.int.test.ts` — drag → recalc; baseline lock → 409.
  - `api.dependencies.int.test.ts` — cycle prevention.
- **Manual / E2E:**
  - Playwright: drag-resize бара (синтетичні events), перевірка PUT request.
  - Browser visual diff: Chrome + Safari + Firefox для SVG рендеру.
  - Open exported XML у MS Project 2019 (вручну на Windows VM).
- **Performance:**
  - k6 / jest perf: CPM 500 tasks ≤ 50 ms.
  - React DevTools profiler: render < 200 ms cold.

## Open Questions

- [ ] Auto-compute `progressPercent` з `actualHours/estimatedHours` чи лишити ручним? Auto — UX краще, але плутає коли estimatedHours відсутні.
- [ ] Якщо задача без `plannedStartAt` (нова створена після baseline freeze) — як показувати? Пропоную: показувати на now() з duration=estimatedHours/8 і прапор "outside baseline".
- [ ] Чи зберігати baseline як окрему модель `TaskBaseline` (snapshot з версіями) замість `plannedStartAt/EndAt`? Pro: множинні baseline (B1, B2, B3). Con: складніше. Я ставлю на простіший варіант з 1 baseline.
- [ ] dhtmlx-gantt $799 commercial — точно НЕ беремо? Підтверджую: НЕ беремо (vendor lock-in + multi-firm проблеми + ціна).
- [ ] Чи треба експорт у CSV додатково до XML?
- [ ] Який крок drag-resize — день, годину, чи snap-to-other-task-edges?

## References

- `prisma/schema.prisma:2076-2125` — Task (extend)
- `prisma/schema.prisma:2293-2307` — TaskDependency (як є, no schema change)
- `prisma/schema.prisma:2316-2322` — TaskViewType enum (GANTT уже є)
- `src/app/admin-v2/me/_components/use-me-tasks.ts:96` — ViewMode union
- `src/app/admin-v2/me/_components/me-dashboard.tsx` — Me dashboard
- `src/app/admin-v2/projects/[id]/_components/tab-tasks.tsx` — Project tasks tab
- `date-fns` (вже у package.json)
- Memory: `project_metrum_full_firm_isolation`
- Memory: `project_metrum_migrations_workflow`
- PMBOK 6th ed. — Section 6.5 (Develop Schedule) для CPM reference
- MS Project XML 2003 schema: https://learn.microsoft.com/en-us/office-project/xml-data-interchange/microsoft-project-xml-schema-reference
