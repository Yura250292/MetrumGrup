# Task 02 — Change Orders / Додаткові угоди

> **Priority:** 🔴 MUST-HAVE | **Estimate:** 3–4 тижні | **Owner:** ___
> **Спрінт:** 2 (після Task 01 Cost Codes у main)
> **Залежить від:** **Task 01** (Cost Codes — обов'язково в main перед стартом)

---

## Mission

Реалізувати в Metrum Group окремий модуль **Change Orders (Додаткові угоди)** для управління змінами обсягу робіт у проєкті після старту: замовник просить додати/змінити/прибрати роботи → система рахує impact на бюджет (по cost code) і графік → multi-step approval → автоматичний каскад на бюджет, Gantt, кошторис, КБ-2/КБ-3. Підключити AI-асистент: з чату з клієнтом detect intent ("додаймо ще одну розетку") → запропонувати draft Change Order з попередньо заповненими значеннями.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini + AssemblyAI + ElevenLabs, Jest.
**Канонічна UI:** `src/app/admin-v2/*`.
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope` з `src/lib/firm/`.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Фінансові цифри — ТІЛЬКИ SUPER_ADMIN (`canViewFinance()`).
**AI:** `src/lib/ai-assistant/` — існуючий чат-асистент на Anthropic + Gemini.
**Notifications:** існуючий `notifyUsers()` (Telegram bot WIP).

---

## Business Goal

**Стандартизувати і прискорити процес змін у проєкті** — найбільший джерело перевитрат і конфліктів з замовником у будівництві.

**Метрики успіху:**
- Цикл "ідея клієнта → підписана ДУ" зменшується з ~14 днів до **≤3 робочих днів**
- 100% затверджених CO автоматично потрапляють у бюджет проєкту (без ручного дублювання у FinanceEntry)
- Кожна ДУ має згенерований PDF за шаблоном фірми + збережений в R2 + відправлений клієнту
- AI-suggest створює draft CO з ≥70% коректністю поля (cost code, опис, прогнозний impact)

**Чому це критично:**
- Без структурованих CO бюджет проєкту "пливе" — фактичні витрати рандомно перевищують план без traceable причин
- Дод. угоди зараз ведуться в Excel/чатах → втрати грошей через незапідписані обсяги
- Залежить від Task 01: impact CO повинен лягати по конкретних cost code, інакше pivot-звіт марний

---

## Out of Scope

- ❌ Електронні підписи (ЕЦП / Diia.Sign) — окремий task
- ❌ Інтеграція з зовнішніми системами замовника (1С, SAP)
- ❌ Versioning історія самого CO (тільки status transitions у audit log)
- ❌ Мульти-валютні CO (тільки UAH на старті)
- ❌ Bulk operations (масовий impact кількох CO одночасно)
- ❌ AI auto-approve — AI тільки drafts, рішення завжди людина

---

## Prerequisites

- [ ] **BLOCKER:** Task 01 (Cost Codes) має бути в `main` гілці + міграція накатана + seed готовий
- [ ] **Узгодити з користувачем:** шаблон PDF дод. угоди (юридична форма — Word/Docx → ми відтворимо)
- [ ] **Узгодити:** хто може створювати CO (MANAGER+ENGINEER чи тільки MANAGER)?
- [ ] **Узгодити:** транзишн PENDING_CLIENT — як підтверджує клієнт (галочка у Client Portal, завантаження сканованого PDF чи обидва)?
- [ ] **Узгодити:** автонумерація CO — наскрізна по фірмі (CO-2026-001) чи по проєкту (PROJ-X-CO-001)?

---

## 🚨 Parallel Conflicts

Цей task редагує:

| Файл                                                            | Конфлікт з           | Стратегія              |
| --------------------------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                                          | усі task-и           | 🔴 серіалізувати       |
| `src/app/admin-v2/_lib/nav.ts`                                  | 01, 03, 04, 05, 07+  | 🔴 серіалізувати       |
| `FinanceEntry` (FK `changeOrderId?`)                            | 01, 06, 10           | 🟡 узгодити            |
| `Task` model (FK `changeOrderId?` на згенеровані задачі)        | 05                   | 🟡 узгодити            |
| `src/app/admin-v2/projects/[id]/page.tsx` (новий tab)           | 05, 07               | 🟡 узгодити tab порядок |
| `src/lib/ai-assistant/` (новий tool `suggest_change_order`)     | 12                   | 🟢 нові файли           |
| `src/lib/notifications/` (нові події)                           | 03, 06               | 🟢 додавання            |

**Порядок:** старт після того як Task 01 у main. Узгодити з Task 05 (Gantt) — обидва чіпають Project tabs.

---

## Data Model (Prisma)

Додати в `prisma/schema.prisma`:

```prisma
enum ChangeOrderType {
  ADD          // додати обсяг
  REMOVE       // прибрати обсяг
  SWAP         // заміна (одне на інше)
}

enum ChangeOrderStatus {
  DRAFT          // створено, ще не подано
  PENDING_PM     // на затвердженні PM
  PENDING_ADMIN  // на затвердженні SUPER_ADMIN
  PENDING_CLIENT // на затвердженні клієнта
  APPROVED       // повністю затверджено — каскад спрацював
  REJECTED       // відхилено (на будь-якому етапі)
  CANCELLED      // ініціатор скасував до APPROVED
}

model ChangeOrder {
  id                  String   @id @default(cuid())
  firmId              String                                    // ✅ multi-firm
  projectId           String
  number              String                                    // CO-2026-001 (унікально в межах firm)
  type                ChangeOrderType
  title               String
  description         String   @db.Text
  reasonFromClient    String?  @db.Text                         // дослівна цитата клієнта
  costImpact          Decimal  @db.Decimal(14, 2)               // підрахована сума, +/-
  scheduleImpactDays  Int      @default(0)                      // +/-
  status              ChangeOrderStatus @default(DRAFT)

  // Audit who/when
  requestedById       String
  requestedAt         DateTime @default(now())
  pmApprovedById      String?
  pmApprovedAt        DateTime?
  adminApprovedById   String?
  adminApprovedAt     DateTime?
  clientApprovedById  String?
  clientApprovedAt    DateTime?
  rejectedById        String?
  rejectedAt          DateTime?
  rejectionReason     String?  @db.Text
  cancelledById       String?
  cancelledAt         DateTime?

  // AI provenance
  aiGenerated         Boolean  @default(false)
  aiSourceChatId      String?
  aiConfidence        Float?

  // Generated artifacts
  pdfUrl              String?                                   // R2 url згенерованої ДУ
  signedPdfUrl        String?                                   // R2 url підписаного клієнтом

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  firm                Firm     @relation(fields: [firmId], references: [id])
  project             Project  @relation(fields: [projectId], references: [id])
  requestedBy         User     @relation("CORequestedBy", fields: [requestedById], references: [id])
  pmApprovedBy        User?    @relation("COPMApprovedBy", fields: [pmApprovedById], references: [id])
  adminApprovedBy     User?    @relation("COAdminApprovedBy", fields: [adminApprovedById], references: [id])
  clientApprovedBy    User?    @relation("COClientApprovedBy", fields: [clientApprovedById], references: [id])
  rejectedBy          User?    @relation("CORejectedBy", fields: [rejectedById], references: [id])
  cancelledBy         User?    @relation("COCancelledBy", fields: [cancelledById], references: [id])

  items               ChangeOrderItem[]
  attachments         ChangeOrderAttachment[]
  transitions         ChangeOrderTransition[]
  financeEntries      FinanceEntry[]
  generatedTasks      Task[]

  @@unique([firmId, number])
  @@index([firmId, projectId, status])
  @@index([firmId, status, requestedAt])
}

model ChangeOrderItem {
  id              String   @id @default(cuid())
  changeOrderId   String
  costCodeId      String                                        // ✅ required (Task 01 уже в main)
  description     String
  unit            String
  qty             Decimal  @db.Decimal(14, 4)
  unitPrice       Decimal  @db.Decimal(14, 2)
  totalPrice      Decimal  @db.Decimal(14, 2)                   // computed: qty*unitPrice*sign
  sign            Int                                           // +1 для ADD, -1 для REMOVE, обидва для SWAP
  sortOrder       Int      @default(0)

  changeOrder     ChangeOrder @relation(fields: [changeOrderId], references: [id], onDelete: Cascade)
  costCode        CostCode    @relation(fields: [costCodeId], references: [id])

  @@index([changeOrderId])
  @@index([costCodeId])
}

model ChangeOrderAttachment {
  id              String   @id @default(cuid())
  changeOrderId   String
  fileName        String
  r2Url           String
  mimeType        String
  fileSize        Int
  uploadedById    String
  uploadedAt      DateTime @default(now())

  changeOrder     ChangeOrder @relation(fields: [changeOrderId], references: [id], onDelete: Cascade)
  uploadedBy      User        @relation(fields: [uploadedById], references: [id])

  @@index([changeOrderId])
}

model ChangeOrderTransition {
  id              String   @id @default(cuid())
  changeOrderId   String
  fromStatus      ChangeOrderStatus
  toStatus        ChangeOrderStatus
  actorId         String
  comment         String?  @db.Text
  createdAt       DateTime @default(now())

  changeOrder     ChangeOrder @relation(fields: [changeOrderId], references: [id], onDelete: Cascade)
  actor           User        @relation(fields: [actorId], references: [id])

  @@index([changeOrderId, createdAt])
}

// === Зміни в існуючих моделях ===

model FinanceEntry {
  // ... існуючі поля
  changeOrderId   String?                                       // якщо entry створено каскадом від CO
  changeOrder     ChangeOrder? @relation(fields: [changeOrderId], references: [id])

  @@index([changeOrderId])
}

model Task {
  // ... існуючі поля
  changeOrderId   String?                                       // задачі що з'явилися з CO
  changeOrder     ChangeOrder? @relation(fields: [changeOrderId], references: [id])

  @@index([changeOrderId])
}
```

---

## Migration Strategy

**Безпечно, без втрати даних:**

1. Додати моделі + FK на FinanceEntry/Task (всі nullable)
2. `npx prisma migrate dev --name add_change_orders`
3. `npx prisma generate`
4. Існуючі дані не торкаються; нова автонумерація стартує з `CO-2026-001` для metrum-group, окремо для metrum-studio

🚨 **ЗАБОРОНЕНО:** `migrate reset`, `--accept-data-loss`.

---

## API Endpoints

Усі під `src/app/api/admin/change-orders/`. Кожен handler — через `resolveFirmScope`. RBAC enforced.

```ts
// GET /api/admin/change-orders?projectId=&status=&from=&to=
GET    /api/admin/change-orders

// POST /api/admin/change-orders
//   Body: { projectId, type, title, description, reasonFromClient?, items[], scheduleImpactDays?, aiSourceChatId? }
//   Auth: MANAGER+ENGINEER (узгодити)
//   Effect: створює DRAFT, генерує number, рахує costImpact
POST   /api/admin/change-orders

// GET /api/admin/change-orders/:id
//   Response: ChangeOrderDetail з items, attachments, transitions, generated entries
GET    /api/admin/change-orders/:id

// PATCH /api/admin/change-orders/:id
//   Дозволено тільки якщо status === DRAFT
PATCH  /api/admin/change-orders/:id

// DELETE /api/admin/change-orders/:id
//   Дозволено тільки якщо status === DRAFT (hard) або CANCELLED (soft already)
DELETE /api/admin/change-orders/:id

// POST /api/admin/change-orders/:id/transition
//   Body: { action: 'submit'|'approve_pm'|'approve_admin'|'approve_client'|'reject'|'cancel', comment? }
//   State machine validation — повертає 409 якщо transition незаконна
//   На 'approve_client' (фінальний APPROVED) — запускає каскад
POST   /api/admin/change-orders/:id/transition

// POST /api/admin/change-orders/:id/attachments
//   multipart/form-data → upload до R2
POST   /api/admin/change-orders/:id/attachments

// POST /api/admin/change-orders/:id/generate-pdf
//   Регенерує PDF (напр., якщо змінився шаблон)
POST   /api/admin/change-orders/:id/generate-pdf

// POST /api/admin/change-orders/:id/upload-signed
//   Завантаження сканованої підписаної ДУ; обовʼязкове для transition APPROVED при підписі off-platform
POST   /api/admin/change-orders/:id/upload-signed

// === Client Portal ===

// GET /api/dashboard/change-orders
//   Тільки ті, де клієнт = поточний user (через ProjectMember.role=CLIENT)
GET    /api/dashboard/change-orders

// POST /api/dashboard/change-orders/:id/approve
//   Тільки коли status === PENDING_CLIENT
POST   /api/dashboard/change-orders/:id/approve

// POST /api/dashboard/change-orders/:id/reject
//   Body: { reason }
POST   /api/dashboard/change-orders/:id/reject

// === AI ===

// POST /api/admin/ai/suggest-change-order
//   Body: { chatId, projectId }
//   AI читає останні N повідомлень → propose draft CO
//   Response: { type, title, description, items[], confidence }
POST   /api/admin/ai/suggest-change-order
```

**State machine (`src/lib/change-orders/state-machine.ts`):**

```ts
export type COAction = 'submit' | 'approve_pm' | 'approve_admin' | 'approve_client' | 'reject' | 'cancel'

export const TRANSITIONS: Record<ChangeOrderStatus, Partial<Record<COAction, ChangeOrderStatus>>> = {
  DRAFT:           { submit: 'PENDING_PM', cancel: 'CANCELLED' },
  PENDING_PM:      { approve_pm: 'PENDING_ADMIN', reject: 'REJECTED', cancel: 'CANCELLED' },
  PENDING_ADMIN:   { approve_admin: 'PENDING_CLIENT', reject: 'REJECTED', cancel: 'CANCELLED' },
  PENDING_CLIENT:  { approve_client: 'APPROVED', reject: 'REJECTED' },
  APPROVED:        {},  // final
  REJECTED:        {},  // final
  CANCELLED:       {},  // final
}

export const ACTION_RBAC: Record<COAction, UserRole[]> = {
  submit:         ['MANAGER', 'ENGINEER', 'SUPER_ADMIN'],
  approve_pm:     ['MANAGER', 'SUPER_ADMIN'],
  approve_admin:  ['SUPER_ADMIN'],
  approve_client: ['CLIENT', 'SUPER_ADMIN'],  // SUPER_ADMIN може підписати від імені клієнта при off-platform підписі
  reject:         ['MANAGER', 'SUPER_ADMIN', 'CLIENT'],
  cancel:         ['MANAGER', 'ENGINEER', 'SUPER_ADMIN'],
}
```

**Cascade on APPROVED (`src/lib/change-orders/cascade.ts`):**

```ts
export async function applyApprovedCascade(coId: string, tx: PrismaClient): Promise<void> {
  // 1. Для кожного item — створити FinanceEntry(kind=PLAN, source=CHANGE_ORDER, costCodeId, changeOrderId)
  // 2. Оновити Project.endDate += scheduleImpactDays
  // 3. Опціонально (якщо узгодимо): згенерувати Task-и для нових робіт
  // 4. notifyUsers (всі stakeholders + клієнт)
  // 5. Згенерувати фінальний PDF з підписами/датами і зберегти в R2
}
```

---

## UI Changes

**Нові файли:**

| Шлях                                                                                  | Призначення                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/app/admin-v2/projects/[id]/_components/tab-change-orders.tsx`                    | Tab "Дод. угоди" на сторінці проєкту                 |
| `src/app/admin-v2/projects/[id]/change-orders/new/page.tsx`                           | Форма створення CO                                   |
| `src/app/admin-v2/projects/[id]/change-orders/[coId]/page.tsx`                        | Деталі CO + history + actions                        |
| `src/app/admin-v2/projects/[id]/change-orders/[coId]/_components/transition-bar.tsx`  | Кнопки transition (з RBAC)                           |
| `src/app/admin-v2/projects/[id]/change-orders/[coId]/_components/items-table.tsx`     | Таблиця items з CostCodePicker                       |
| `src/app/admin-v2/projects/[id]/change-orders/[coId]/_components/history-drawer.tsx`  | Drawer з audit-log transitions                       |
| `src/app/admin-v2/change-orders/page.tsx`                                             | Глобальний список CO (всі проєкти, фільтри)          |
| `src/app/dashboard/change-orders/page.tsx`                                            | Список для клієнта (Client Portal)                   |
| `src/app/dashboard/change-orders/[id]/page.tsx`                                       | Деталі CO для клієнта + Approve/Reject buttons       |
| `src/lib/change-orders/state-machine.ts`                                              | TRANSITIONS, ACTION_RBAC, validation                 |
| `src/lib/change-orders/cascade.ts`                                                    | applyApprovedCascade                                 |
| `src/lib/change-orders/numbering.ts`                                                  | generateCONumber(firmId) — атомарно через UNIQUE+retry |
| `src/lib/change-orders/pdf-generator.ts`                                              | PDF gen на основі шаблону (узгодити lib: pdf-lib/puppeteer) |
| `src/lib/ai-assistant/tools/suggest-change-order.ts`                                  | AI tool, додати в registry існуючого асистента       |
| `src/lib/notifications/change-order-events.ts`                                        | notifyUsers wrappers для кожного transition          |
| `src/components/CostImpactBadge.tsx`                                                  | Badge з +/- сумою (приховано якщо !canViewFinance)   |

**Змінені файли:**

| Шлях                                                              | Зміна                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| `src/app/admin-v2/_lib/nav.ts`                                    | Додати "Дод. угоди" в section "Проєкти"              |
| `src/app/admin-v2/projects/[id]/page.tsx`                         | Додати tab "Дод. угоди" з counter badge              |
| `src/app/dashboard/_components/sidebar.tsx`                       | Додати пункт "Дод. угоди" для клієнтів               |
| `src/lib/ai-assistant/registry.ts`                                | Зареєструвати tool `suggest_change_order`            |
| `src/app/admin-v2/finance/page.tsx`                               | Фільтр "тільки з CO" + колонка з CO-номером          |

---

## Implementation Plan (step-by-step)

1. [ ] Підтвердити що Task 01 у main, накатати міграції локально
2. [ ] Узгодити з користувачем: шаблон PDF, RBAC на створення, нумерація, формат client approval
3. [ ] Отримати шаблон ДУ у Word → перекласти в HTML/React-template для PDF gen
4. [ ] Додати моделі (CO, COItem, COAttachment, COTransition) + FK на FinanceEntry/Task у `prisma/schema.prisma`
5. [ ] `npx prisma migrate dev --name add_change_orders`
6. [ ] `npx prisma generate`
7. [ ] Реалізувати `src/lib/change-orders/state-machine.ts` + unit-тести (всі переходи + ACTION_RBAC)
8. [ ] Реалізувати `src/lib/change-orders/numbering.ts` — атомарна автогенерація (transaction + retry on UNIQUE collision)
9. [ ] Реалізувати `src/lib/change-orders/cascade.ts` (FinanceEntry generation, Project.endDate update, notify)
10. [ ] Тести для cascade — окрема БД, перевірити що PLAN entries з'явились з правильним costCodeId
11. [ ] Реалізувати `src/lib/change-orders/pdf-generator.ts` (узгодити: pdf-lib чи puppeteer-based)
12. [ ] API: GET/POST/PATCH/DELETE /api/admin/change-orders
13. [ ] API: POST /transition з state-machine validation + RBAC
14. [ ] API: POST /attachments (R2 upload через існуючий util)
15. [ ] API: POST /generate-pdf, /upload-signed
16. [ ] API: Client Portal endpoints (GET, approve, reject)
17. [ ] AI tool `suggest_change_order` + інтеграція в `ai-assistant/registry.ts`
18. [ ] UI: tab "Дод. угоди" в `projects/[id]/page.tsx`
19. [ ] UI: форма створення (з CostCodePicker з Task 01)
20. [ ] UI: деталі сторінка з transition-bar + history-drawer
21. [ ] UI: глобальний список `/admin-v2/change-orders` з фільтрами
22. [ ] UI: Client Portal — список + сторінка деталей з Approve/Reject
23. [ ] Notifications: на кожен transition — `notifyUsers` (events: submitted, pm_approved, admin_approved, client_approved, rejected, cancelled)
24. [ ] Оновити `src/app/admin-v2/_lib/nav.ts` + `dashboard/_components/sidebar.tsx`
25. [ ] CostImpactBadge — приховує суми якщо `!canViewFinance(user)`
26. [ ] `npm run test:unit && npm run typecheck && npm run lint`
27. [ ] Manual QA (див. Testing)
28. [ ] Commit + push

---

## Acceptance Criteria

- [ ] **State machine:** будь-яка незаконна transition повертає HTTP 409 (тест на всі 21 невалідні комбо)
- [ ] **RBAC:** non-SUPER_ADMIN на `approve_admin` → 403; CLIENT може approve тільки свій CO у статусі PENDING_CLIENT
- [ ] **Multi-firm isolation:** користувач metrum-studio не бачить CO metrum-group (інтеграційний тест)
- [ ] **Cascade:** при APPROVED — створено FinanceEntry(kind=PLAN, source=CHANGE_ORDER) на кожен item; Project.endDate оновлено; notification надіслано
- [ ] **Numbering:** 100 паралельних `POST /change-orders` створюють унікальні номери без колізій (load-тест або mock)
- [ ] **PDF:** для APPROVED CO згенеровано PDF, доступний за `pdfUrl`, відкривається у браузері без помилок
- [ ] **AI suggest:** для тестового чату з фразою "клієнт каже додати ще 5 розеток" — AI повертає draft з ≥3 заповненими полями (title, description, items з cost code "08.41.xx")
- [ ] **Cost visibility:** non-SUPER_ADMIN бачить CO, але без сум (`CostImpactBadge` показує "***")
- [ ] **Audit trail:** `ChangeOrderTransition` записи з'являються на кожен transition з actor+timestamp; history-drawer їх відображає
- [ ] **Tests:** ≥15 нових юніт-тестів, всі зелені; `npm run typecheck && npm run lint` чисто

---

## Testing

**Unit (`src/lib/change-orders/__tests__/`):**
- `state-machine.test.ts` — усі легальні + 21 нелегальна transition; ACTION_RBAC enforcement
- `numbering.test.ts` — паралельні generation (race condition mock через jest.fn)
- `cascade.test.ts` — APPROVED створює правильні FinanceEntry; Project.endDate += days; ідемпотентність (повторний виклик не дублює entries)
- `pdf-generator.test.ts` — snapshot основних блоків PDF

**Integration (`src/app/api/admin/change-orders/__tests__/`):**
- `route.test.ts` — CRUD з RBAC
- `transition.test.ts` — повний happy-path (DRAFT → APPROVED) + reject path + cancel
- `client-portal.test.ts` — CLIENT може approve/reject тільки свої CO

**Manual QA chek-list:**
- [ ] Створити CO у статусі DRAFT, додати 3 items з різними cost codes — costImpact рахується правильно
- [ ] Submit → PM approve → ADMIN approve → CLIENT approve у Client Portal → перевірити що FinanceEntries з'явились у бюджеті, кінцева дата проєкту змінилася
- [ ] Завантажити підписаний PDF як attachment перед approve_client → SUPER_ADMIN може approve "від імені клієнта"
- [ ] AI: у чаті з клієнтом написати "додаймо ще одну розетку у санвузлі" → кнопка "Створити CO" з'являється з draft
- [ ] Перемкнути firm → CO другої фірми не видно
- [ ] Як MANAGER (не SUPER_ADMIN) — суми у CO приховані як "***"
- [ ] Reject на PENDING_PM з reason → CO у REJECTED, no cascade, notification надіслано
- [ ] Cancel у DRAFT → CANCELLED, no audit issues

---

## Open Questions

- [ ] Шаблон PDF: чи треба підпис ЕЦП у MVP, чи поки достатньо сканованого підпису?
- [ ] PDF gen: pdf-lib (HTML-free) чи puppeteer (HTML→PDF, важче, але красивіше)?
- [ ] Хто може створювати CO: MANAGER+ENGINEER чи тільки MANAGER (узгодити)
- [ ] Нумерація: наскрізна по фірмі (`CO-2026-001`) чи по проєкту (`PROJ-X-CO-001`)?
- [ ] Чи генерувати Task-и на нові роботи автоматично при APPROVED, чи окрема кнопка "Створити задачі з CO"?
- [ ] Чи треба версіонування самого CO (якщо клієнт просить "змінити пункт 3 у вже поданій ДУ") — чи створювати новий CO?
- [ ] Локальна цитата клієнта (`reasonFromClient`) — обовʼязкове поле чи опціональне?

---

## References

- ДБН А.2.2-3:2014 — Склад та зміст проектної документації на будівництво (формат дод. угод)
- Task 01: `/Users/admin/Igor-Shiba/metrum-group/docs/roadmap-2026/01-cost-codes-wbs.md`
- `/Users/admin/Igor-Shiba/metrum-group/CLAUDE.md`
- `/Users/admin/Igor-Shiba/metrum-group/AGENTS.md`
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/ai-assistant/` — існуючий AI асистент, патерн tool registry
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/notifications/` — `notifyUsers` API
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/firm/resolveFirmScope.ts` — для firm-scoped queries
- `/Users/admin/Igor-Shiba/metrum-group/src/lib/foreman/` — приклад існуючого approval flow (DRAFT → APPROVED → FinanceEntry)
