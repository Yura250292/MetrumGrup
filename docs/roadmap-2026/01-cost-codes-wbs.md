# Task 01 — Cost Codes / WBS наскрізно

> **Priority:** 🔴 MUST-HAVE | **Estimate:** 4–6 тижнів | **Owner:** ___
> **Спрінт:** 1 (фундамент, blocker для 02, 06, 07, 08, 09, 10, 12)

---

## Mission

Запровадити в Metrum Group наскрізну систему **Cost Codes / WBS (Work Breakdown Structure)** на основі класифікатора **ДСТУ Б Д.1.1-1:2013** (УРН — українські ресурсні елементні норми). Кожна фінансова сутність системи (бюджет, факт, кошторис, ЗП виконробської бригади, foreman-звіт) повинна тегуватися кодом виду робіт. Це переводить компанію з обліку "по проєктах" на **real job costing**: план vs факт по статтях робіт, прогноз перевитрат, точне обґрунтування дод. угод.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini + AssemblyAI + ElevenLabs, Jest.
**Канонічна UI:** `src/app/admin-v2/*`.
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope` з `src/lib/firm/`.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Фінансові цифри — ТІЛЬКИ SUPER_ADMIN (`canViewFinance()`).
**Тести:** `src/lib/**/__tests__/*.test.ts` + `npm run test:unit`.

---

## Business Goal

**Перехід від "грошей по проєктах" до "грошей по видах робіт у розрізі проєктів".**

**Метрики успіху:**
- ≥80% нових `FinanceEntry` за місяць після релізу — з заповненим `costCodeId`
- Foreman обирає cost code на мобілці за **≤2 секунди** (autocomplete з recents)
- Pivot-звіт "cost code × project × plan/fact" відкривається за <1.5 сек на даних 12 міс.
- Перевитрати по конкретних статтях видно ДО завершення проєкту, а не post-mortem

**Чому це критично:**
- Дод. угоди (Task 02) неможливо рахувати без cost code → impact на бюджет повинен лягати на конкретну статтю
- Розподіл ЗП бригади по статтях (Task 10) — без cost code не зробити
- Тендери (Task 08) і Document Builder КБ-2/КБ-3 (Task 07) опираються на cost code в кошторисі

---

## Out of Scope

- ❌ AI auto-tagging існуючих `FinanceEntry` (окремий міні-task у бекглозі, тут — тільки nullable міграція)
- ❌ Експорт у MS Project / BIM 360 — лише внутрішня структура
- ❌ Імпорт повного ДСТУ XML — для MVP достатньо seed-скрипту з ~300 ключових кодів
- ❌ Multi-language коди (тільки UA на старті)
- ❌ Прив'язка до International Cost Codes (CSI MasterFormat) — наступна ітерація

---

## Prerequisites

- [ ] **Узгодити з користувачем:** повний класифікатор ДСТУ (~3000 кодів) vs скорочений MVP (~300 найуживаніших для цивільного будівництва)?
- [ ] **Узгодити:** чи мігруємо існуючі `FinanceEntry` руками/AI/залишаємо null (рекомендую null + окрема задача auto-tagging)
- [ ] **Узгодити:** глибина дерева — 5 рівнів достатньо чи треба до 7 як в повному ДСТУ?
- [ ] Підтвердити з фінансовим відділом: список з ~30 найкритичніших статей для пілота

---

## 🚨 Parallel Conflicts

Цей task редагує:

| Файл                                          | Конфлікт з           | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                        | **усі task-и**       | 🔴 серіалізувати       |
| `src/app/admin-v2/_lib/nav.ts`                | 02, 03, 04, 05, 07+  | 🔴 серіалізувати       |
| `FinanceEntry` model (додає `costCodeId?`)    | 02, 06, 10           | 🟡 узгодити заздалегідь |
| `ForemanReport` model (`defaultCostCodeId?`)  | 03, 06, 10           | 🟡 узгодити            |
| `ForemanReportItem` model (`costCodeId`)      | 03, 10               | 🟡 узгодити            |
| `EstimateItem` model (`costCodeId?`)          | 07                   | 🟡 узгодити            |
| `EmployeePayrollPeriod` (`costCodeId?`)       | 10                   | 🟡 узгодити            |
| `src/components/forms/CostCodePicker.tsx`     | новий — без конфлікту | 🟢                     |

**Порядок:** цей task запускається ПЕРШИМ у спрінті. Усі інші чекають, поки CostCode model потрапить у `main`.

---

## Data Model (Prisma)

Додати в `prisma/schema.prisma`:

```prisma
model CostCode {
  id          String   @id @default(cuid())
  firmId      String                                  // ✅ multi-firm
  code        String                                  // напр. "08.41.01"
  name        String                                  // "Влаштування підлог з керамічної плитки"
  description String?  @db.Text
  unit        String?                                 // "м²", "м³", "т", "шт"
  parentId    String?                                 // self-ref для дерева
  level       Int                                     // 0 = root, до 4 (5 рівнів)
  path        String                                  // matpath "01/01.05/01.05.02" — для швидких queries
  isLeaf      Boolean  @default(true)                 // true якщо немає дітей; на leaf можна тегувати
  isActive    Boolean  @default(true)                 // soft delete
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  firm        Firm      @relation(fields: [firmId], references: [id])
  parent      CostCode? @relation("CostCodeTree", fields: [parentId], references: [id])
  children    CostCode[] @relation("CostCodeTree")

  financeEntries        FinanceEntry[]
  foremanReports        ForemanReport[]        @relation("ForemanReportDefaultCostCode")
  foremanReportItems    ForemanReportItem[]
  estimateItems         EstimateItem[]
  payrollPeriods        EmployeePayrollPeriod[]

  @@unique([firmId, code])                            // код унікальний у межах фірми
  @@index([firmId, parentId])
  @@index([firmId, path])
  @@index([firmId, isLeaf, isActive])
}

// === Зміни в існуючих моделях ===

model FinanceEntry {
  // ... існуючі поля
  costCodeId  String?
  costCode    CostCode? @relation(fields: [costCodeId], references: [id])

  @@index([costCodeId])
}

model ForemanReport {
  // ... існуючі поля
  defaultCostCodeId String?
  defaultCostCode   CostCode? @relation("ForemanReportDefaultCostCode", fields: [defaultCostCodeId], references: [id])

  @@index([defaultCostCodeId])
}

model ForemanReportItem {
  // ... існуючі поля
  costCodeId  String?                                 // на старті nullable, потім required
  costCode    CostCode? @relation(fields: [costCodeId], references: [id])

  @@index([costCodeId])
}

model EstimateItem {
  // ... існуючі поля
  costCodeId  String?
  costCode    CostCode? @relation(fields: [costCodeId], references: [id])

  @@index([costCodeId])
}

model EmployeePayrollPeriod {
  // ... існуючі поля
  costCodeId  String?                                 // nullable; стане required у Task 10
  costCode    CostCode? @relation(fields: [costCodeId], references: [id])

  @@index([costCodeId])
}
```

---

## Migration Strategy

**Поетапно, БЕЗ деструктивних операцій:**

1. **Phase A (цей task):** усі нові FK — `nullable`. `npx prisma migrate dev --name add_cost_codes`. Існуючі записи не торкаються.
2. **Phase B (через 2 місяці після Task 10):** після auto-tagging задачі — зробити `costCodeId` required на `ForemanReportItem` і `EmployeePayrollPeriod`. Окрема міграція.
3. **Phase C (eventually):** required на `FinanceEntry` (тільки після того як 95% записів затеговано).

🚨 **ЗАБОРОНЕНО:** `migrate reset`, `db push --force-reset`, `--accept-data-loss`.

Команди безпечно:
```bash
npx prisma migrate dev --name add_cost_codes_phase_a
npx prisma generate
npx tsx scripts/seed-cost-codes.ts
```

---

## API Endpoints

Усі під `src/app/api/admin/cost-codes/`. Кожен handler — через `resolveFirmScope`.

```ts
// GET /api/admin/cost-codes?view=tree|flat&q=плитк&onlyLeaf=true
//   Response: CostCodeTreeNode[] | CostCodeFlatItem[]
GET    /api/admin/cost-codes

// GET /api/admin/cost-codes/:id
//   Response: CostCodeDetail (з parent chain, дітьми, use count)
GET    /api/admin/cost-codes/:id

// POST /api/admin/cost-codes
//   Body: { code, name, description?, unit?, parentId?, sortOrder? }
//   Auth: SUPER_ADMIN only
//   Side effect: рекалькулює level + path
POST   /api/admin/cost-codes

// PATCH /api/admin/cost-codes/:id
//   Body: Partial<{ name, description, unit, sortOrder, isActive, parentId }>
//   Якщо parentId змінився — рекурсивно перерахувати path у всіх нащадків
PATCH  /api/admin/cost-codes/:id

// DELETE /api/admin/cost-codes/:id
//   Якщо useCount > 0 → soft delete (isActive=false), 200
//   Якщо 0 → hard delete, 204
DELETE /api/admin/cost-codes/:id

// GET /api/admin/cost-codes/recents
//   Response: CostCode[] — top-10 для поточного user (на основі останніх FinanceEntry/ForemanReportItem)
//   Використовується у CostCodePicker
GET    /api/admin/cost-codes/recents

// GET /api/admin/reports/cost-codes?from=...&to=...&projectId=...
//   Response: { rows: [{ costCode, project, planSum, factSum, variance, variancePct }] }
//   RBAC: тільки SUPER_ADMIN (canViewFinance)
GET    /api/admin/reports/cost-codes
```

**Handler signatures:**

```ts
// src/app/api/admin/cost-codes/route.ts
export async function GET(req: Request) {
  const session = await getServerAuthSession()
  const { firmIds } = await resolveFirmScope(session)
  const { view = 'tree', q, onlyLeaf } = Object.fromEntries(new URL(req.url).searchParams)
  // ...
}

// src/lib/cost-codes/queries.ts
export async function getCostCodeTree(firmId: string, opts?: { onlyActive?: boolean })
export async function searchCostCodes(firmId: string, query: string, limit = 20)
export async function getRecentCostCodesForUser(userId: string, firmId: string, limit = 10)
export async function recomputePath(codeId: string): Promise<void>
export async function getUseCount(codeId: string): Promise<number>
```

---

## UI Changes

**Нові файли:**

| Шлях                                                                | Призначення                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/components/forms/CostCodePicker.tsx`                           | Autocomplete + tree drill-down + recents + keyboard nav    |
| `src/components/forms/CostCodePicker.mobile.tsx`                    | Окремий компонент для foreman PWA — велика touch-зона      |
| `src/app/admin-v2/catalogs/cost-codes/page.tsx`                     | CRUD сторінка з tree-view + bulk actions                   |
| `src/app/admin-v2/catalogs/cost-codes/_components/tree-node.tsx`    | Рекурсивний компонент вузла з expand/collapse              |
| `src/app/admin-v2/catalogs/cost-codes/_components/edit-drawer.tsx`  | Drawer для create/edit                                     |
| `src/app/admin-v2/reports/cost-codes/page.tsx`                      | Pivot-звіт cost code × project × plan/fact                 |
| `src/app/admin-v2/reports/cost-codes/_components/pivot-table.tsx`   | Sticky-header pivot з drill-down                           |
| `src/lib/cost-codes/queries.ts`                                     | Server-side queries (firm-scoped)                          |
| `src/lib/cost-codes/path.ts`                                        | Утиліти matpath (computeLevel, computePath, validateNoCycle) |
| `scripts/seed-cost-codes.ts`                                        | Idempotent seed з УРН-класифікатором                       |
| `prisma/data/cost-codes-dstu.json`                                  | Згенерований дамп ~300 кодів (по узгодженню — або 3000)    |

**Змінені файли:**

| Шлях                                                                | Зміна                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/app/admin-v2/_lib/nav.ts`                                      | Додати пункти "Каталог → Коди робіт" та "Звіти → По кодах"  |
| `src/app/admin-v2/finance/_components/entry-form.tsx`               | Додати `<CostCodePicker>` (optional на старті)              |
| `src/app/foreman/reports/new/_components/item-row.tsx`              | Додати `<CostCodePicker.mobile>`                            |
| `src/app/admin-v2/estimates/[id]/_components/item-row.tsx`          | Додати `<CostCodePicker>`                                   |
| `src/app/admin-v2/finance/_components/entry-filters.tsx`            | Фільтр по cost code                                         |

---

## Implementation Plan (step-by-step)

1. [ ] Узгодити з користувачем: скорочений MVP (~300 кодів) чи повний (~3000)
2. [ ] Підготувати `prisma/data/cost-codes-dstu.json` (за погодженим обсягом)
3. [ ] Додати модель `CostCode` + FK на 5 існуючих моделей у `prisma/schema.prisma`
4. [ ] `npx prisma migrate dev --name add_cost_codes_phase_a`
5. [ ] `npx prisma generate`
6. [ ] Написати `src/lib/cost-codes/path.ts` (matpath, validateNoCycle, computeLevel)
7. [ ] Написати `src/lib/cost-codes/queries.ts` (усі firm-scoped через `resolveFirmScope`)
8. [ ] Тести для path.ts (`__tests__/path.test.ts` — циклы, глибина, перерахунок при move)
9. [ ] Написати `scripts/seed-cost-codes.ts` (idempotent — upsert по `firmId+code`, для обох фірм)
10. [ ] Запустити seed на dev БД, перевірити дерево
11. [ ] API: `GET /api/admin/cost-codes` (tree + flat + search)
12. [ ] API: `POST/PATCH/DELETE` з RBAC SUPER_ADMIN
13. [ ] API: `GET /recents` (top-10 для user)
14. [ ] API: `GET /api/admin/reports/cost-codes` (pivot) — обережно з RBAC (`canViewFinance`)
15. [ ] Компонент `CostCodePicker.tsx` (desktop) — autocomplete + tree modal
16. [ ] Компонент `CostCodePicker.mobile.tsx` — touch-friendly, ≤2 сек до вибору
17. [ ] Сторінка `admin-v2/catalogs/cost-codes/page.tsx` — tree CRUD
18. [ ] Сторінка `admin-v2/reports/cost-codes/page.tsx` — pivot з drill-down
19. [ ] Інтегрувати picker у FinanceEntry form, ForemanReport item-row, EstimateItem row
20. [ ] Додати фільтр по cost code в `finance/_components/entry-filters.tsx`
21. [ ] Оновити `src/app/admin-v2/_lib/nav.ts`
22. [ ] Унікальний user-perf тест: foreman picker на справжній мобілці ≤2 сек
23. [ ] `npm run test:unit && npm run typecheck && npm run lint`
24. [ ] Commit + push (інші чати чекають саме на цей момент)

---

## Acceptance Criteria

- [ ] **Multi-firm:** seed створив окремі дерева для `metrum-group` і `metrum-studio`, queries не повертають коди чужої фірми (юніт-тест)
- [ ] **Foreman UX:** picker на iPhone (real device або Chrome DevTools mobile emulation) — вибір коду за ≤2 сек з моменту відкриття поля
- [ ] **Pivot-звіт:** на сторінці `/admin-v2/reports/cost-codes` видно матрицю code × project з plan/fact/variance; відкривається за <1.5 сек на ≥10k FinanceEntry
- [ ] **RBAC:** не-SUPER_ADMIN отримує 403 на `/reports/cost-codes` (суми приховано)
- [ ] **Tree integrity:** API повертає 400 при спробі зробити вузол нащадком свого ж нащадка (cycle detection); тест зелений
- [ ] **Soft delete:** видалення коду з `useCount > 0` робить `isActive=false`, не видаляє; код зникає з picker, але існуючі записи зберігають linkage
- [ ] **Migration path:** після `migrate dev` усі існуючі FinanceEntry читаються без помилок (FK nullable)
- [ ] **Tests:** `npm run test:unit` — 100% зелений; додано ≥8 нових тестів (path, queries, RBAC, picker логіка)
- [ ] **Lint+TS:** `npm run typecheck && npm run lint` чисто

---

## Testing

**Unit (`src/lib/cost-codes/__tests__/`):**
- `path.test.ts` — computeLevel, computePath, validateNoCycle, recomputePath rekurs
- `queries.test.ts` — firm-scope ізоляція (не повертає коди чужої фірми), search, recents
- `use-count.test.ts` — підрахунок використання у 5 моделях

**Integration (`src/app/api/admin/cost-codes/__tests__/`):**
- `route.test.ts` — CRUD з RBAC (SUPER_ADMIN ok, MANAGER 403 на write)
- `reports.test.ts` — pivot endpoint з canViewFinance check

**Manual QA chek-list:**
- [ ] Створити код вручну → з'являється у picker за ≤1 сек
- [ ] Перенести підгілку (зміна parent) → path оновився у нащадків
- [ ] Створити FinanceEntry без cost code → ОК (nullable)
- [ ] Foreman у kiosk-режимі → вибір коду на мобілці ≤2 сек, recents працюють
- [ ] Звіт за 12 місяців → завантажується <1.5 сек
- [ ] Manager (не SUPER_ADMIN) → не бачить колонок з сумами у звіті (або 403)
- [ ] Перемкнути firm у session → дерево перемкнулося повністю

---

## Open Questions

- [ ] Чи мігруємо існуючі ~3000 FinanceEntry за квітень-2026 автоматично через AI, чи залишаємо null до окремої задачі?
- [ ] Класифікатор: повний ДСТУ (3000 кодів) чи скорочений MVP (300)?
- [ ] Чи потрібна окрема "статистика по бригаді" (cost code × team) одразу, чи окремий task?
- [ ] Чи seed-итимо обидві фірми однаковим класифікатором, чи Studio має свій (інтер'єр-специфічний)?
- [ ] Picker на мобілці: bottom-sheet чи full-screen modal?

---

## References

- ДСТУ Б Д.1.1-1:2013 — Правила визначення вартості будівництва (УРН)
- ДСТУ Б Д.2.2 — Ресурсні елементні кошторисні норми (РЕКН) на будівельні роботи
- `/Users/admin/Igor-Shiba/metrum-group/CLAUDE.md`
- `/Users/admin/Igor-Shiba/metrum-group/AGENTS.md`
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/firm/` — приклад використання `resolveFirmScope`
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/foreman/` — як написана існуюча foreman інтеграція з FinanceEntry
