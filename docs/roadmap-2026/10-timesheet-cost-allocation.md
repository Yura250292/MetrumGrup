# Task 10 — Timesheet з Cost Allocation і Multi-Level Approval

> Priority: 🔴 HIGH | Estimate: 3–4 тижні | Owner: ___

## Mission

Запустити повноцінний модуль обліку робочого часу: робітник (через mobile/PWA) щоденно списує години по `Project` + `CostCode` (опційно `Task`) → бригадир approve → PM approve → фінансист approve. На фінальному approve система автоматично створює `FinanceEntry(kind=FACT, source=TIMESHEET)` по labor cost (години × ставка) і прив'язує до існуючого `EmployeePayrollPeriod` (імпортованого з 1С). Результат — точний job-costing по labor, контроль продуктивності бригад, узгодження з 1С-payroll без подвійного введення.

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Jest.
**Канонічна UI:** `src/app/admin-v2/*` для approve-UI; `src/app/foreman/*` для робітник-UI (kiosk PWA).
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope`.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Фінансові цифри (ставки, ЗП) — ТІЛЬКИ SUPER_ADMIN через `canViewFinance()`. Робітники бачать лише свої години (без сум). Бригадир бачить свою бригаду (теж без сум). PM бачить суми лише якщо є SUPER_ADMIN role.
**Foreman flow:** Text/photo/PDF/Excel → AI parse → `ForemanReport(DRAFT)` → manager approve → `FinanceEntry(kind=FACT, source=FOREMAN_REPORT)`. Тут — НЕЗАЛЕЖНИЙ flow з source=TIMESHEET, не міксуємо.
**Тести:** `src/lib/**/__tests__/*.test.ts` + `npm run test:unit`.
**🚨 DB:** НЕ `migrate reset`, НЕ `db push --force-reset`. Тільки `migrate deploy` / `migrate dev` на локальній throwaway.

## Business Goal

- Замінити паперові табелі на digital workflow з audit-trail.
- Дати PM-у дані по реальних трудовитратах **по cost-code** → точний job-costing (доповнення до Task 01).
- Виявляти overhead (адмін-години, простої) які зараз губляться у "загальній" ЗП з 1С.
- Узгоджувати digital timesheet з імпортованим `EmployeePayrollPeriod` (з 1С) → mismatch alert.
- Метрика: 100% активних робітників (`Employee.isActive=true`) сабмітять timesheet щоденно за 30 днів після запуску; ≥ 95% сабмітів проходять foreman+PM approval у той самий тиждень; mismatch між digital годинами і 1С табелем ≤ 5%.

## Out of Scope

- Geo-fencing / GPS-track робітників (privacy + UX).
- Біометрія / face-recognition при clock-in (окремий task, дорогий).
- Інтеграція з турнікетами / RFID-картками.
- Автоматичне нарахування ЗП (1С робить це; ми тільки cross-check). Прямого "запис у бух" немає — `EmployeePayrollPeriod` оновлюється скриптом імпорту з 1С (як зараз).
- Контрактні робітники (`EmploymentType.CONTRACT`) у MVP — лише `FULL`+`PART_TIME`.
- Овертайм-коефіцієнти (× 1.5 за нічні години, святкові) — окрема фіча.

## Prerequisites

- [ ] Task 01 (Cost Codes) — `CostCode` model готова; `TimesheetEntry.costCodeId` обов'язковий.
- [ ] **Прочитати поточну схему `EmployeePayrollPeriod`** (вже зробив у preflight). Імпорт 2026-04 → 108 записів, поля: officialPart, pdfo, vz, esv, taxesTotal, salaryToCard, totalSum, advance, sickLeave, vacationPay, bonus, metrumExpenses (всі `Decimal? @db.Decimal(12,2)`, nullable).
- [ ] `Employee.userId` має бути виставлений для тих, хто буде сабмітити (інакше worker не зайде через next-auth). Перевірити: `SELECT count(*) FROM employees WHERE userId IS NULL AND isActive=true` — якщо багато, окремий task "Прив'язати User до Employee".
- [ ] `Team` model вже існує (бригади з імпорту); потрібен зв'язок `EmployeeTeam.teamLeadId` як основа для foreman-approval scope.

## 🚨 Parallel Conflicts

| Файл / артефакт                          | З ким серіалізуватись                   |
| ---------------------------------------- | --------------------------------------- |
| `prisma/schema.prisma`                   | **усі task-и**                          |
| `Employee` model (нові relations + поле `hourlyRate`) | HR-related tasks (якщо є)    |
| `EmployeePayrollPeriod` (нове поле `digitalHoursTotal` для reconciliation) | payroll-import scripts — узгодити |
| `FinanceEntry` model (новий source=TIMESHEET) | 01, 02, 06, 09 — додати enum-варіант  |
| `src/app/admin-v2/_lib/nav.ts`           | усі                                     |
| `src/app/foreman/_lib/nav.ts` (якщо є)   | 03 (foreman v2)                         |
| `src/lib/foreman/*`                      | 03 — узгодити, не дублювати helpers     |
| `Task` model (back-relation `timesheetEntries`) | 05 — додати relation, не міняти fields |

## Data Model (Prisma)

```prisma
enum TimesheetStatus {
  DRAFT
  SUBMITTED
  APPROVED_FOREMAN
  APPROVED_PM
  APPROVED_FINANCE
  REJECTED
}

model TimesheetEntry {
  id                    String          @id @default(cuid())
  firmId                String
  firm                  Firm            @relation(fields: [firmId], references: [id])
  employeeId            String
  employee              Employee        @relation("EmployeeTimesheetEntries", fields: [employeeId], references: [id], onDelete: Cascade)
  /// День, на який списані години (без часу — date-only-семантика).
  date                  DateTime        @db.Date
  projectId             String
  project               Project         @relation("ProjectTimesheetEntries", fields: [projectId], references: [id], onDelete: Restrict)
  costCodeId            String
  /// FK на CostCode додається фазою B після Task 01 у main.
  taskId                String?
  task                  Task?           @relation("TaskTimesheetEntries", fields: [taskId], references: [id], onDelete: SetNull)
  /// Декларовані години. Decimal(4,2): 0.25..24.00, крок 0.25.
  hours                 Decimal         @db.Decimal(4, 2)
  description           String?
  status                TimesheetStatus @default(DRAFT)
  rejectionReason       String?

  submittedAt           DateTime?
  /// Snapshot ставки на момент submit (бо Employee.hourlyRate може змінитись).
  hourlyRateSnapshot    Decimal?        @db.Decimal(10, 2)
  /// hours × hourlyRateSnapshot, denormalised. NULL до APPROVED_FINANCE.
  calculatedLaborCost   Decimal?        @db.Decimal(12, 2)

  foremanApprovedById   String?
  foremanApprovedBy     User?           @relation("TimesheetForemanApprover", fields: [foremanApprovedById], references: [id])
  foremanApprovedAt     DateTime?

  pmApprovedById        String?
  pmApprovedBy          User?           @relation("TimesheetPmApprover", fields: [pmApprovedById], references: [id])
  pmApprovedAt          DateTime?

  financeApprovedById   String?
  financeApprovedBy     User?           @relation("TimesheetFinanceApprover", fields: [financeApprovedById], references: [id])
  financeApprovedAt     DateTime?

  /// Idempotency для генерації FinanceEntry: гарантує, що повторний approve не зробить дубль.
  resultingFinanceEntryId String?       @unique
  resultingFinanceEntry   FinanceEntry? @relation("TimesheetResultingFinance", fields: [resultingFinanceEntryId], references: [id], onDelete: SetNull)

  /// До якого `EmployeePayrollPeriod` цей запис відноситься (period = "YYYY-MM" по date).
  /// Заповнюється автоматично на створенні. NULL якщо period ще не імпортований.
  payrollPeriodId       String?
  payrollPeriod         EmployeePayrollPeriod? @relation("PayrollPeriodTimesheetEntries", fields: [payrollPeriodId], references: [id], onDelete: SetNull)

  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  /// Один робітник × дата × проєкт × cost-code × task — унікальний рядок.
  /// Якщо потрібно змінити години — UPDATE, не INSERT.
  @@unique([employeeId, date, projectId, costCodeId, taskId])
  @@index([firmId, status, date])
  @@index([employeeId, date])
  @@index([projectId, costCodeId, date])
  @@index([payrollPeriodId])
  @@map("timesheet_entries")
}
```

Розширення існуючих моделей:

```prisma
// model Employee {
//   ...
//   /// Поточна базова годинна ставка (UAH/год). Може бути NULL для тих, хто на окладі —
//   /// тоді derive з EmployeeSalary остання активна / норма годин на місяць (~168).
//   hourlyRate          Decimal?         @db.Decimal(10, 2)
//   timesheetEntries    TimesheetEntry[] @relation("EmployeeTimesheetEntries")
// }

// model EmployeePayrollPeriod {
//   ...
//   /// Сума digital-годин у цьому періоді (sum of TimesheetEntry.hours where status=APPROVED_FINANCE).
//   /// Заповнюється тригером / cron. Для reconciliation з 1С (officialPart передбачає ~168 год/міс при FULL).
//   digitalHoursTotal   Decimal?         @db.Decimal(8, 2)
//   timesheetEntries    TimesheetEntry[] @relation("PayrollPeriodTimesheetEntries")
// }

// model Project {
//   ...
//   timesheetEntries    TimesheetEntry[] @relation("ProjectTimesheetEntries")
// }

// model Task {
//   ...
//   timesheetEntries    TimesheetEntry[] @relation("TaskTimesheetEntries")
// }

// model User { (back-relations)
//   timesheetsApprovedAsForeman TimesheetEntry[] @relation("TimesheetForemanApprover")
//   timesheetsApprovedAsPm      TimesheetEntry[] @relation("TimesheetPmApprover")
//   timesheetsApprovedAsFinance TimesheetEntry[] @relation("TimesheetFinanceApprover")
// }

// model FinanceEntry {
//   ...
//   timesheetEntry      TimesheetEntry?  @relation("TimesheetResultingFinance")
// }

// enum FinanceEntrySource
//   + TIMESHEET
```

## Migration Strategy

1. **Phase A:** додати `TimesheetEntry` + enum + back-relations. На `Employee` додати `hourlyRate Decimal? @db.Decimal(10,2)` (nullable, backfill окремо). На `EmployeePayrollPeriod` додати `digitalHoursTotal Decimal? @db.Decimal(8,2)`.
   ```bash
   npx prisma migrate dev --name timesheet_phase_a_model
   ```
2. **Phase B (FK):** після Task 01 у main — окрема міграція `timesheet_phase_b_costcode_fk` додає FK на `cost_codes(id)`.
3. **Phase C — backfill `Employee.hourlyRate`:**
   - Скрипт `scripts/backfill-hourly-rates.ts`:
     - Для кожного `Employee` з активною `EmployeeSalary` — derive: `hourlyRate = officialMonthly / (168 * employmentRate)`.
     - Якщо немає `EmployeeSalary` — взяти `EmployeePayrollPeriod.officialPart` останнього періоду / 168.
     - Якщо ні того, ні того — лишити NULL, флагувати у звіті "потрібно ввести вручну".
   - **Idempotent:** скрипт можна пере-запускати, він лише UPDATE-ить NULL-ові.
4. **Phase D — `payrollPeriodId` backfill** (порожній на старті): trigger функція або cron, що раз на ніч для нових `TimesheetEntry` шукає `EmployeePayrollPeriod{ employeeId, period: format(date,"yyyy-MM") }` і виставляє FK. У MVP можна робити це в момент створення `TimesheetEntry` (sync).
5. **No retroactive data** — historical hours не вводимо, починаємо з дати релізу.

⚠️ Виконувати лише проти **локальної throwaway-БД**. Production котиться через `prisma migrate deploy`. Hook `~/.claude/hooks/db-guard.sh` блокує небезпечне.

## API Endpoints

### Worker (auth required, scope: лише свої entries)

| Verb   | Path                                       | Body                                                  | Response                          |
| ------ | ------------------------------------------ | ----------------------------------------------------- | --------------------------------- |
| GET    | `/api/foreman/timesheet`                   | `?from&to` (default: поточний тиждень)                | `TimesheetEntry[]`                |
| POST   | `/api/foreman/timesheet`                   | `{ date, projectId, costCodeId, taskId?, hours, description? }` | `TimesheetEntry`        |
| PATCH  | `/api/foreman/timesheet/:id`               | partial (тільки якщо `status=DRAFT` | `REJECTED`)    | `TimesheetEntry`                  |
| DELETE | `/api/foreman/timesheet/:id`               | — (тільки `DRAFT`)                                     | 204                               |
| POST   | `/api/foreman/timesheet/submit`            | `{ ids: string[] }` (bulk submit DRAFT → SUBMITTED)   | `{ submitted: number }`           |
| GET    | `/api/foreman/timesheet/options`           | —                                                     | `{ projects[], costCodes[], tasks[] }` — лише доступні цьому Employee |

### Foreman / Brigadier approve (auth + role=FOREMAN|MANAGER|SUPER_ADMIN)

| Verb | Path                                                  | Body                                       | Response                         |
| ---- | ----------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| GET  | `/api/admin/timesheet/approval-queue`                 | `?level=foreman|pm|finance&projectId&teamId&weekOf` | `{ entries: [...], summary }`    |
| POST | `/api/admin/timesheet/:id/approve`                    | `{ level: "foreman"|"pm"|"finance" }`      | `TimesheetEntry`                 |
| POST | `/api/admin/timesheet/:id/reject`                     | `{ level, reason }`                        | `TimesheetEntry`                 |
| POST | `/api/admin/timesheet/bulk-approve`                   | `{ ids: string[], level }`                 | `{ approved: number, errors }`   |

### Reports / Reconciliation (SUPER_ADMIN, FINANCIER)

| Verb | Path                                                  | Query                                | Response                                       |
| ---- | ----------------------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| GET  | `/api/admin/timesheet/reports/labor-productivity`     | `?from&to&teamId&projectId&costCodeId` | `{ rows: [{ team, hours, cost, vs_prev_week }] }` |
| GET  | `/api/admin/timesheet/reports/cost-by-costcode`       | `?projectId&from&to`                  | `{ rows: [{ costCode, hours, cost, share_% }] }` |
| GET  | `/api/admin/timesheet/reports/payroll-reconciliation` | `?period=YYYY-MM`                     | `{ rows: [{ employee, digitalHours, expectedHours, payrollOfficialPart, deltaPct }] }` |

### Handler signatures (приклади)

```ts
// src/app/api/admin/timesheet/[id]/approve/route.ts
export async function POST(req, { params }) {
  const session = await auth(); /* + assertRole */
  const { level } = z.object({ level: z.enum(["foreman","pm","finance"]) }).parse(await req.json());
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: params.id }, include: { employee: true }});
  await assertFirmScope(session, entry.firmId);
  await assertCanApprove(session, entry, level); // foreman: must be team-lead; pm: must be project.manager; finance: SUPER_ADMIN|FINANCIER

  // state-machine transition
  const result = await prisma.$transaction(async (tx) => {
    const next = nextStatusAfterApprove(entry.status, level);
    if (next === entry.status) throw new Error("ILLEGAL_TRANSITION");
    const updated = await tx.timesheetEntry.update({ where:{id}, data: {
      status: next,
      [`${level}ApprovedById`]: session.user.id,
      [`${level}ApprovedAt`]: new Date(),
    }});
    if (next === "APPROVED_FINANCE") {
      await createFinanceEntryForTimesheet(tx, updated); // idempotent via resultingFinanceEntryId
      await updatePayrollPeriodHours(tx, updated.payrollPeriodId);
    }
    return updated;
  });
  return NextResponse.json(result);
}
```

## UI Changes

### Worker UI (mobile-friendly, foreman PWA-style)

- `src/app/foreman/timesheet/page.tsx` — головна сторінка тижневого табеля:
  - Header з вибором тижня (← поточний →)
  - Список днів (Пн-Нд). Для кожного дня — список entries (project + costCode + hours), inline "+" для додавання
  - Bottom-bar: "Здати на затвердження" (submit всі DRAFT поточного тижня)
  - **Mobile-first:** великі кнопки, touch-friendly, працює без миші
  - PWA: офлайн-додавання entries (зберігаємо в `IndexedDB`), sync при відновленні мережі
- `src/app/foreman/timesheet/_components/EntryQuickAdd.tsx` — bottom-sheet modal:
  - Step 1: дата (default = today)
  - Step 2: проєкт (з `/api/foreman/timesheet/options` — лише ті, де Employee active member)
  - Step 3: cost-code (autocomplete з recent у топі)
  - Step 4: task (optional — підвантажується по projectId)
  - Step 5: години (numeric pad 0.25 крок)
  - Step 6: опис
- `src/app/foreman/timesheet/_components/WeekSummary.tsx` — sticky-footer: "Цього тижня: 32 год | План: 40 | Перевиконання: -8"

### Brigadier / PM / Finance approval UI

- `src/app/admin-v2/timesheet/approve/page.tsx`:
  - Tabs: "Бригадирські" (level=foreman), "PM" (level=pm), "Фінанси" (level=finance)
  - Pivot-таблиця: рядки = робітник × тиждень, колонки = day-by-day total
  - Hover на клітинку → drill-down у конкретні entries
  - Bulk-select по checkbox-ах + кнопка "Approve all selected"
  - Reject — модалка з обов'язковим `reason`
- `src/app/admin-v2/timesheet/page.tsx` — overview всіх timesheet з фільтрами (team, project, dateRange, status)
- `src/app/admin-v2/reports/labor-productivity/page.tsx` — звіт продуктивності:
  - Графік (recharts): hours per team per week
  - Таблиця: team × project × costCode → hours + cost (RBAC: cost тільки SUPER_ADMIN)
- `src/app/admin-v2/timesheet/reconciliation/page.tsx` — звіт reconciliation:
  - period selector (YYYY-MM)
  - таблиця: Employee | digitalHours | normHours (168 × employmentRate) | EmployeePayrollPeriod.officialPart | delta% | status (OK / WARN ≥ 5% / FAIL ≥ 15%)

### Components

- `src/components/timesheet/`
  - `TimesheetStatusBadge.tsx` — кольорові badges по статусу
  - `ApprovalChainIndicator.tsx` — 3-step progress: Foreman → PM → Finance, з галочками/датами
  - `HoursOverlapWarning.tsx` — якщо у Employee у один день sum(hours) > 12 — попередження

### Nav

- `src/app/admin-v2/_lib/nav.ts`:
  ```ts
  { href: "/admin-v2/timesheet/approve", label: "Табелі", icon: Clock, roles: ["FOREMAN","MANAGER","FINANCIER","SUPER_ADMIN"], badge: pendingCount }
  ```
- `src/app/foreman/_lib/nav.ts` (якщо файл існує — з task 03):
  ```ts
  { href: "/foreman/timesheet", label: "Мій табель", icon: Clock }
  ```

## Implementation Plan

1. Створити гілку `feat/timesheet-cost-allocation`. `git pull main`, `npm run typecheck` зелений.
2. **Phase A migration:** `TimesheetEntry` + back-relations + `Employee.hourlyRate` + `EmployeePayrollPeriod.digitalHoursTotal`. `npx prisma migrate dev --name timesheet_phase_a_model`. Закомітити.
3. `npx prisma generate`. Створити zod-схеми `src/lib/timesheet/schemas.ts`.
4. State-machine: `src/lib/timesheet/state.ts` з функцією `nextStatusAfterApprove(current, level) → status` + `canApprove(session, entry, level)`. Покрити тестом усі переходи (включно з illegal).
5. RBAC helpers: `src/lib/timesheet/rbac.ts`:
   - `canApproveAsForeman(session, entry)` — перевіряє, що session.user — `Team.teamLeadId` для team, у якій `Employee` (TeamMember).
   - `canApproveAsPm(session, entry)` — `entry.project.managerId === session.user.id` OR SUPER_ADMIN.
   - `canApproveAsFinance(session, entry)` — `["SUPER_ADMIN","FINANCIER"].includes(session.user.role)`.
6. Worker endpoints (`/api/foreman/timesheet/*`) з scope: лише `entry.employeeId == session.user.employee.id`. Перевірити `Employee.userId` link.
7. Approval endpoints (`/api/admin/timesheet/*`) з firm-scope + RBAC + state-transition.
8. Auto-cost calc: `src/lib/timesheet/finance-sync.ts`:
   - `calculateHourlyRate(employee, date)` — fallback chain: `Employee.hourlyRate` → `EmployeeSalary` active at date → `EmployeePayrollPeriod.officialPart` / 168 → throw NEEDS_RATE.
   - `createFinanceEntryForTimesheet(tx, entry)` — створює `FinanceEntry { kind: FACT, type: EXPENSE, source: TIMESHEET, amount: hours × rate, costCodeId, projectId, occurredAt: entry.date, category: "Праця", title: "${employee.fullName} — ${costCode.name}" }`. Idempotent через `TimesheetEntry.resultingFinanceEntryId` unique.
   - На REJECT після APPROVED_FINANCE — окрема функція `reverseFinanceEntryForTimesheet` (delete or set isArchived=true).
9. Payroll period sync: `src/lib/timesheet/payroll-sync.ts`:
   - `upsertPayrollPeriodLink(entry)` — на створенні entry виставляє `payrollPeriodId` (find-or-null).
   - `recalcPayrollPeriodHours(periodId)` — SUM hours WHERE status=APPROVED_FINANCE; UPDATE `digitalHoursTotal`.
10. Hours overlap detection: при POST `/foreman/timesheet` перевіряти, що `SUM(hours) per (employeeId, date) ≤ 16` (грейс) — інакше 422 з message "Перевищено 16 год/день".
11. Worker UI (mobile): `src/app/foreman/timesheet/page.tsx` + `EntryQuickAdd` bottom-sheet. PWA-cache (service worker уже є з task 03).
12. Brigadier/PM/Finance UI: `src/app/admin-v2/timesheet/approve/page.tsx` з pivot-таблицею. Server component для початкового рендеру + client island для bulk-select.
13. Reports UI: `/admin-v2/reports/labor-productivity`, `/admin-v2/timesheet/reconciliation` (4 пункти у nav).
14. Notifications: при submit → notify foreman; при foreman approve → notify pm; при reject → notify worker. Через існуючий `notifyUsers` (Telegram bot з MEMORY).
15. Cron / nightly: `src/lib/cron/timesheet-reconciliation.ts` — раз на ніч ре-розраховує `EmployeePayrollPeriod.digitalHoursTotal` для активних періодів (idempotent).
16. Seed (опційно для dev): один Employee з 5 entries у DRAFT, один в APPROVED_FOREMAN.
17. **Тести** (див. нижче) — обов'язкові перед PR.
18. Manual QA: повний цикл worker→foreman→pm→finance на staging; перевірити mobile UX; перевірити що рівні бачать тільки своє (firm + scope).
19. Документація: `src/app/admin-v2/timesheet/HELP.md` (вбудована довідка для PM).
20. PR, code-review, merge.

## Acceptance Criteria

1. Робітник з мобільного може за ≤ 60 сек додати entry (date+project+costCode+hours) і відправити на затвердження.
2. Approval state-machine жорстко: не можна approve_pm поки немає approve_foreman; не можна approve_finance без approve_pm. Спроба → 409.
3. На APPROVED_FINANCE атомарно створюється `FinanceEntry(kind=FACT, source=TIMESHEET, amount=hours×rateSnapshot, costCodeId=...)`. Повторний approve (idempotent guard) не створює дубль.
4. Workers Studio (firmId=metrum-studio) і Group не бачать одне одного timesheet навіть якщо MANAGER рівня (firm isolation).
5. Робітник не бачить ставку і calculatedLaborCost (canViewFinance=false → колонки приховані). PM теж — крім випадку SUPER_ADMIN.
6. На rejection — entry повертається у status=REJECTED, worker отримує notification, може edit і re-submit.
7. На post `/foreman/timesheet` з sum(hours per day) > 16 — 422 з message; UI показує warning.
8. Звіт reconciliation для періоду "2026-04" показує всіх 223 Employee (з імпорту 2026-04) і delta% між digital годинами і officialPart/168.
9. PWA офлайн: робітник без мережі може додати entry → при появі мережі sync auto.
10. Усі transitions покриті unit-тестами (foreman→pm→finance + illegal). Concurrent approve по тому ж entry — лише один success.

## Testing

### Unit (`src/lib/timesheet/__tests__/`)
- `state.test.ts` — state-machine: DRAFT→SUBMITTED→APPROVED_FOREMAN→APPROVED_PM→APPROVED_FINANCE; illegal (DRAFT→APPROVED_FINANCE → throw); REJECT з кожного approve-стану → REJECTED.
- `rbac.test.ts` — foreman не з тієї бригади → false; pm не цього проєкту → false; finance не з SUPER_ADMIN/FINANCIER → false.
- `finance-sync.test.ts` — створення FinanceEntry з правильними полями; idempotency (повторний call не дублює); reverse при rejection.
- `payroll-sync.test.ts` — upsert payrollPeriodId на створенні; recalc digitalHoursTotal при APPROVED_FINANCE.
- `hourly-rate.test.ts` — fallback chain: hourlyRate → EmployeeSalary → EmployeePayrollPeriod → throw.
- `overlap.test.ts` — sum hours > 16 → false; ровно 16 → true.

### Integration (`src/app/api/**/__tests__/`)
- `worker-create.test.ts` — POST entry успіх; з чужим employeeId → 403; з невалідним costCodeId → 422.
- `approve-flow.test.ts` — повний end-to-end: worker submit → foreman approve → pm approve → finance approve → FinanceEntry створено.
- `concurrent-approve.test.ts` — два паралельні POST `/approve` на той самий entry → один success, другий conflict.
- `firm-isolation.test.ts` — Studio user не бачить Group entries.

### Components
- `EntryQuickAdd.test.tsx` — крок-за-кроком форма; hours validator (0.25 крок).
- `ApprovalChainIndicator.test.tsx` — рендер з різними станами.
- `HoursOverlapWarning.test.tsx` — > 12 год → warning; > 16 → error.

### Manual / E2E
- Smoke: 3 робітники у Studio + 3 у Group → кожен сабмітить 5 entries за тиждень → бригадир approve bulk → PM approve → finance approve → перевірити FinanceEntry-зведення по проекту.
- Mobile (iPhone Safari + Android Chrome): timesheet входить, форма зручна, sticky-bar не перекриває контент.
- Offline PWA: airplane-mode → add entries → online → sync OK без дублів.
- Lighthouse: foreman/timesheet ≥ 90 performance, ≥ 95 accessibility.

## Open Questions

1. **Норма годин на місяць** — використовувати фіксовану 168 чи парсити робочий календар (свята, скорочені дні)? **Припускаю: 168 у MVP; календар — окремий task.**
2. **Овертайм-коефіцієнт** — нічні × 1.5, святкові × 2? **Припускаю: НЕ в MVP, флаг `hours` чисто кількість. Окремий task потім.**
3. **Робітник без `Employee.userId`** (не має account-у) — як зайти? **Опція A:** автогенерувати User через скрипт для всіх Employee.isActive=true (HR робить це окремо). **Опція B:** "kiosk-режим" на shared-планшеті — один акаунт бригадира заводить entries за всіх своїх. **Уточнити у користувача.** Припускаю B як fallback.
4. **EmploymentType.CONTRACT** — як обрахувати ставку (немає 168)? **Припускаю: для CONTRACT — `hourlyRate` обов'язкове, fallback не працює.**
5. **Чи зливати timesheet з `Timesheet` model** (існує: `Employee.timesheets`)? **Прочитати її схему перед старом — якщо вона legacy / порожня, depricate і використовувати `TimesheetEntry`. Якщо живе — узгодити з HR-командою.** Перевірити у preflight.
6. **Reconciliation alert threshold** — 5% / 10% / 15%? **Припускаю: WARN ≥ 5%, FAIL ≥ 15%.**
7. **Чи дозволяти edit після APPROVED_FOREMAN** (наприклад, опечатка)? **Припускаю: edit лише у DRAFT+REJECTED; після SUBMITTED — тільки через reject+resubmit.**
8. **Кейс "робітник у відпустці"** (`isVacation=true` у EmployeePayrollPeriod) — блокувати створення entries на ці дати? **Припускаю: warning, не блок.**

## References

- **Файли проєкту:**
  - `prisma/schema.prisma`:
    - `EmployeePayrollPeriod` @ 3092
    - `Employee` @ 3137 (вже існують `timesheets Timesheet[]`, `salaries EmployeeSalary[]`, `payrollPeriods` — перевірити legacy `Timesheet` model)
    - `FinanceEntry` @ 573
    - `Worker` @ 1064, `Task` @ 2076, `Project` @ 122
  - `src/lib/firm/scope.ts`, `src/lib/firm/server-scope.ts`
  - `src/lib/auth.ts`, `canViewFinance()` helper
  - `src/lib/foreman/*` (приклад для finance-entry автогенерації)
  - `src/app/foreman/*` (приклад PWA layout, service worker)
  - `scripts/import-staff-may2026.ts` (як seed EmployeePayrollPeriod)
- **Залежні task-и:** `01-cost-codes-wbs.md`, `03-foreman-mobile-v2.md` (PWA infra)
- **MEMORY:** `project_metrum_finance_access_rule.md`, `project_metrum_staff_payroll_imported_2026_04.md`, `project_metrum_foreman_role.md`, `project_metrum_migrations_workflow.md`
- **External:**
  - [ConTech timesheet best practices — RICS](https://www.rics.org/) — multi-level approval як стандарт
  - Український КЗпП ст. 50, 52 — норма 40 год/тиждень, 168 год/міс
