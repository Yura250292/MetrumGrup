# Task 12 — HSE / Safety Module (Охорона праці)

> **Priority:** 🟢 NICE-TO-HAVE | **Estimate:** 3 тижні | **Owner:** ___
> **Спрінт:** після стабілізації foreman-флоу та notification-каналів

---

## Mission

Запровадити в Metrum Group повний цикл управління охороною праці (Health, Safety, Environment):

1. **Реєстр інцидентів** — від near-miss до тяжких/смертельних випадків (форма Н-1).
2. **Журнали інструктажів** з електронним підписом на тачскріні замість паперових журналів.
3. **Оцінка ризиків** (Risk Assessment) з матрицею likelihood × severity.
4. **Корективні дії** з тегуванням відповідального і дедлайном.
5. **Compliance-моніторинг** — cron-нагадування про повторні інструктажі (≥90 днів за УА законом).

Кінцева ціль — пройти перевірку Держпраці без папок паперових журналів.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini, Jest. Telegram bot — окремий процес.
**Канонічна UI:** `src/app/admin-v2/*`. Foreman PWA: `src/app/foreman/*` (SW v5.3.0).
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope` з `src/lib/firm/scope.ts`.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT.
- HSE-роль реалізуємо як derivative `HR` + boolean `User.isSafetyOfficer` (без нового enum-значення, щоб не зачіпати весь RBAC). Альтернатива: новий role `SAFETY_OFFICER` — узгодити з користувачем (див. Open Questions).
**Notifications:** `src/lib/notifications/` — multi-channel (in-app + Telegram).

---

## Business Goal

**Перевести облік охорони праці з паперу в систему.** Без HSE-обліку компанію штрафують і не пускають на держоб'єкти.

**Метрики успіху:**
- 100% інструктажів за період — з електронними підписами всіх присутніх
- Compliance rate ≥95% по 3-місячних повторних інструктажах
- Час фіксації інциденту з kiosk PWA — ≤90 секунд (фото + категорія + опис)
- PDF-журнал інструктажів за квартал генерується <5 сек і приймається Держпраці без зауважень

**Чому це матиме сенс саме зараз:**
- Foreman PWA вже існує — додати "Повідомити про інцидент" — мала фіча, велика користь.
- `EmployeePayrollPeriod` уже має зв'язок з Employee → можна тегувати інструктажі на конкретного Employee.

---

## Out of Scope

- ❌ Інтеграція з ДСНС/Держпраці API (немає публічного API)
- ❌ Видача СІЗ (засоби індивідуального захисту) — окремий складський модуль
- ❌ Медогляди співробітників — окрема HR-фіча (передбачити hook на майбутнє через `Employee.lastMedicalCheckAt`)
- ❌ ISO 45001 audit-генератор (наступна ітерація, коли наберемо рік даних)
- ❌ Багатомовність (UA-only)

---

## Prerequisites

- [ ] **Узгодити з користувачем:** HSE-роль — новий `SAFETY_OFFICER` чи `HR + isSafetyOfficer` boolean?
- [ ] Узгодити: PDF Н-1 формується тільки SUPER_ADMIN, чи також HR?
- [ ] Підтвердити список обов'язкових типів інструктажів (НПАОП 0.00-4.12-05): вступний, первинний, повторний, позаплановий, цільовий.
- [ ] Зразок паперового журналу інструктажів від замовника (для копіювання форми в PDF).

---

## 🚨 Parallel Conflicts

| Файл                                          | Конфлікт з           | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                        | **усі task-и**       | 🔴 серіалізувати       |
| `src/app/admin-v2/_lib/nav.ts`                | 02, 03, 13, 14       | 🔴 серіалізувати       |
| `src/app/foreman/_layout.tsx` (FAB "Інцидент")| 03, 10               | 🟡 узгодити            |
| `src/lib/notifications/dispatch.ts`           | 13, 15               | 🟡 додати channel-key  |
| `Employee` model (`lastBriefingAt?`)          | 10                   | 🟡 узгодити            |
| `User` model (`isSafetyOfficer Boolean`)      | RBAC-залежні task-и  | 🟡 узгодити            |
| `src/components/forms/SignatureCanvas.tsx`    | новий — без конфлікту | 🟢                     |
| `cron/safety-briefing-reminder.ts`            | новий — без конфлікту | 🟢                     |

---

## Data Model (Prisma)

Додати в `prisma/schema.prisma`:

```prisma
enum IncidentType {
  NEAR_MISS
  MINOR_INJURY
  MAJOR_INJURY
  FATAL
  PROPERTY_DAMAGE
  ENVIRONMENTAL
}

enum IncidentStatus {
  REPORTED
  INVESTIGATING
  RESOLVED
}

enum SafetyBriefingType {
  INTRODUCTORY     // Вступний (при прийомі на роботу)
  PRIMARY          // Первинний на робочому місці
  REPEAT_3M        // Повторний (раз на 3 міс — НПАОП)
  UNSCHEDULED      // Позаплановий (після інциденту, зміни технології)
  TARGETED         // Цільовий (разова робота підвищеної небезпеки)
}

enum RiskAssessmentStatus {
  ACTIVE
  REVIEWING
  CLOSED
}

enum IncidentAttachmentType {
  PHOTO
  DOC
  VIDEO
}

model Incident {
  id                  String          @id @default(cuid())
  firmId              String                                            // ✅ multi-firm
  projectId           String?
  date                DateTime                                          // дата інциденту (може бути не = reportedAt)
  type                IncidentType
  severity            Int                                               // 1–5 (1 = легкий, 5 = критичний)
  description         String          @db.Text
  location            String?                                           // ділянка/поверх/корпус
  weatherConditions   String?                                           // для outdoor
  reportedById        String
  reportedAt          DateTime        @default(now())
  status              IncidentStatus  @default(REPORTED)
  resolvedAt          DateTime?
  rootCause           String?         @db.Text
  correctiveActions   String?         @db.Text
  investigatedById    String?
  // Поля для форми Н-1 (тяжкі/смертельні випадки)
  isReportableN1      Boolean         @default(false)
  n1ReportNumber      String?
  n1ReportedToDsp     DateTime?                                         // дата подачі до Держпраці

  firm                Firm            @relation(fields: [firmId], references: [id])
  project             Project?        @relation(fields: [projectId], references: [id])
  reportedBy          User            @relation("IncidentReporter", fields: [reportedById], references: [id])
  investigatedBy      User?           @relation("IncidentInvestigator", fields: [investigatedById], references: [id])
  involvedUsers       IncidentInvolvedUser[]
  attachments         IncidentAttachment[]

  @@index([firmId, date])
  @@index([firmId, status])
  @@index([projectId])
  @@index([type, severity])
}

model IncidentInvolvedUser {
  incidentId  String
  userId      String?                                                   // якщо це User з системи
  employeeId  String?                                                   // якщо це Employee без User
  fullName    String                                                    // фіксується текстом завжди (audit-trail)
  injuryNote  String?

  incident    Incident   @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  user        User?      @relation(fields: [userId], references: [id])
  employee    Employee?  @relation(fields: [employeeId], references: [id])

  @@id([incidentId, fullName])
}

model IncidentAttachment {
  id          String                  @id @default(cuid())
  incidentId  String
  fileUrl     String                                                    // R2 URL
  fileName    String
  type        IncidentAttachmentType
  uploadedAt  DateTime                @default(now())
  uploadedById String?

  incident    Incident   @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  @@index([incidentId])
}

model SafetyBriefing {
  id                String              @id @default(cuid())
  firmId            String                                              // ✅ multi-firm
  projectId         String?                                             // null = загальний (наприклад, вступний у офісі)
  type              SafetyBriefingType
  conductedAt       DateTime
  conductedById     String?                                             // якщо проводив User
  conductedByName   String                                              // дублюємо ПІБ текстом для audit
  topic             String
  content           String              @db.Text                        // зміст інструктажу (для перевірки)
  location          String?
  npaopReference    String?                                             // напр. "НПАОП 45.2-1.02-90"
  createdAt         DateTime            @default(now())

  firm              Firm                @relation(fields: [firmId], references: [id])
  project           Project?            @relation(fields: [projectId], references: [id])
  conductedBy       User?               @relation(fields: [conductedById], references: [id])
  attendees         SafetyBriefingAttendee[]

  @@index([firmId, conductedAt])
  @@index([firmId, type])
  @@index([projectId])
}

model SafetyBriefingAttendee {
  id              String          @id @default(cuid())
  briefingId      String
  userId          String?                                               // якщо attendee = User
  workerId        String?                                               // якщо worker без User
  employeeId      String?                                               // якщо це Employee (із кадрів)
  fullName        String
  position        String?
  signatureBase64 String          @db.Text                              // canvas signature (PNG base64)
  attendedAt      DateTime        @default(now())

  briefing        SafetyBriefing  @relation(fields: [briefingId], references: [id], onDelete: Cascade)
  user            User?           @relation(fields: [userId], references: [id])
  employee        Employee?       @relation(fields: [employeeId], references: [id])

  @@unique([briefingId, fullName])
  @@index([employeeId, attendedAt])                                     // для cron compliance-check
}

model RiskAssessment {
  id                  String                  @id @default(cuid())
  firmId              String                                            // ✅ multi-firm
  projectId           String?
  hazard              String                                            // короткий опис небезпеки
  category            String                                            // "Електробезпека", "Робота на висоті", "Хімічна"...
  likelihood          Int                                               // 1–5
  severity            Int                                               // 1–5
  riskScore           Int                                               // computed at write = likelihood × severity (1–25)
  currentControls     String                  @db.Text
  additionalActions   String?                 @db.Text
  residualRisk        Int                                               // 1–25 після additionalActions
  responsibleUserId   String?
  reviewDate          DateTime
  status              RiskAssessmentStatus    @default(ACTIVE)
  createdAt           DateTime                @default(now())
  updatedAt           DateTime                @updatedAt

  firm                Firm                    @relation(fields: [firmId], references: [id])
  project             Project?                @relation(fields: [projectId], references: [id])
  responsibleUser     User?                   @relation(fields: [responsibleUserId], references: [id])

  @@index([firmId, status])
  @@index([firmId, reviewDate])
  @@index([projectId, riskScore])
}

// === Зміни в існуючих моделях ===

model Employee {
  // ... існуючі поля
  lastBriefingAt        DateTime?                                       // оновлюється тригером після INSERT SafetyBriefingAttendee
  briefingAttendees     SafetyBriefingAttendee[]
  incidentInvolvements  IncidentInvolvedUser[]
}

model User {
  // ... існуючі поля
  isSafetyOfficer       Boolean   @default(false)                       // HR-користувач з HSE-доступом
  incidentsReported     Incident[] @relation("IncidentReporter")
  incidentsInvestigated Incident[] @relation("IncidentInvestigator")
  briefingsConducted    SafetyBriefing[]
  briefingAttendances   SafetyBriefingAttendee[]
  riskAssessments       RiskAssessment[]
  incidentInvolvements  IncidentInvolvedUser[]
}
```

---

## Migration Strategy

1. Локально створити throwaway-БД, зробити `prisma migrate dev --name add_hse_module --create-only`, перевірити SQL очима.
2. Перевірити що нові relations не ламають існуючі сіди (`npm run db:seed` локально).
3. Production: тільки `prisma migrate deploy` (НІКОЛИ `migrate diff --shadow-database-url` — інцидент 2026-05-22).
4. Backfill `Employee.lastBriefingAt = null` — поле nullable, без backfill.
5. Окремий seed-скрипт `scripts/seed-risk-categories.ts` — заливає 15 типових категорій ризиків з НПАОП.

---

## API Endpoints

```
GET    /api/admin/safety/incidents                 # list з фільтрами (firmId, status, type, dateRange)
POST   /api/admin/safety/incidents                 # створити
GET    /api/admin/safety/incidents/:id
PATCH  /api/admin/safety/incidents/:id             # update status, rootCause, correctiveActions
POST   /api/admin/safety/incidents/:id/attachments # upload фото (R2)
DELETE /api/admin/safety/incidents/:id             # SUPER_ADMIN only

GET    /api/admin/safety/briefings                 # list
POST   /api/admin/safety/briefings                 # створити + attendees + підписи в одному payload
GET    /api/admin/safety/briefings/:id
GET    /api/admin/safety/briefings/:id/pdf         # PDF журналу (Puppeteer)

GET    /api/admin/safety/risks                     # list з фільтрами
POST   /api/admin/safety/risks
PATCH  /api/admin/safety/risks/:id
DELETE /api/admin/safety/risks/:id

# Звіти
GET    /api/admin/safety/reports/incidents-stats   # за період: count by type, severity, project
GET    /api/admin/safety/reports/briefing-compliance # % працівників з briefing у межах 90 днів
GET    /api/admin/safety/reports/risk-matrix       # heatmap likelihood × severity
GET    /api/admin/safety/reports/journal.pdf       # консолідований PDF для Держпраці

# Foreman PWA
POST   /api/foreman/incidents                      # швидке reporting з kiosk (FOREMAN role)
GET    /api/foreman/incidents/my                   # мої повідомлені інциденти

# Cron
POST   /api/internal/cron/safety-briefing-reminder # called by Railway cron / external scheduler
```

RBAC матриця:
- `incidents` create/read: усі автентифіковані (включно з FOREMAN). Update/resolve: HR з `isSafetyOfficer=true` + SUPER_ADMIN.
- `briefings` create: HR/SAFETY_OFFICER + MANAGER. Read: усі автентифіковані бачать СВОЇ attendance.
- `risks` повний CRUD: HR/SAFETY_OFFICER + ENGINEER + SUPER_ADMIN.
- `journal.pdf` за квартал: тільки SUPER_ADMIN та HR з `isSafetyOfficer=true`.

---

## UI Changes

### `src/app/admin-v2/safety/`

Структура:
```
src/app/admin-v2/safety/
  page.tsx                              # overview-дашборд (KPI картки)
  incidents/
    page.tsx                            # список + фільтри
    new/page.tsx                        # форма створення
    [id]/page.tsx                       # деталка з timeline статусів
  briefings/
    page.tsx                            # список
    new/page.tsx                        # майстер: тема → присутні → підписи
    [id]/page.tsx                       # перегляд + PDF download
  risks/
    page.tsx                            # таблиця + Risk Matrix Heatmap (5×5)
    new/page.tsx
    [id]/page.tsx
  reports/
    page.tsx                            # вибір типу звіту + дати → PDF
```

### `src/app/foreman/safety/`

- `report-incident/page.tsx` — kiosk-form: вибір типу інциденту → фото камерою → 3 поля → submit.
- FAB-кнопка "🚨 Інцидент" у foreman shell-у.

### Компоненти

- `src/components/forms/SignatureCanvas.tsx` — touchscreen signature, повертає PNG base64. На базі `signature_pad` (npm: ~10kb). Підтримка undo, clear, мінімальна довжина штриха для валідації.
- `src/components/safety/RiskMatrix.tsx` — 5×5 heatmap (likelihood × severity), tooltip з кількістю ризиків у клітинці, drilldown на список.
- `src/components/safety/IncidentBadge.tsx` — кольоровий бейдж severity з типом.
- `src/components/safety/BriefingAttendeesEditor.tsx` — multi-select Employee + canvas signature на кожного.

### Навігація

`src/app/admin-v2/_lib/nav.ts`: новий пункт "Охорона праці" (icon: HardHat), видимий тільки якщо `user.isSafetyOfficer || user.role === 'SUPER_ADMIN' || user.role === 'HR'`.

---

## Implementation Plan

1. **Узгодити open questions** з користувачем (роль SAFETY_OFFICER, шаблон Н-1).
2. **Prisma schema:** додати enums + 5 моделей + extensions, локальний `migrate dev`.
3. **Seed:** `scripts/seed-risk-categories.ts` (15 категорій), `scripts/seed-briefing-templates.ts` (5 типів інструктажів × текст).
4. **`src/lib/safety/`** — service layer: `incidents.ts`, `briefings.ts`, `risks.ts`, `compliance.ts`. Всі функції приймають `firmId` явно.
5. **API routes** для admin-v2 (8 endpoints) з firm-scope + RBAC guards.
6. **API routes** для foreman PWA (2 endpoints).
7. **`SignatureCanvas` компонент** + unit-тести (валідація base64, undo logic).
8. **UI admin-v2 списки** (incidents, briefings, risks) — pagination + фільтри.
9. **UI admin-v2 forms** — створення/редагування з валідацією.
10. **UI foreman** — incident reporting form (mobile-first, камера через `<input capture>`).
11. **Risk Matrix компонент** + drilldown.
12. **PDF-генератор журналу інструктажів** — `src/lib/safety/pdf/briefing-journal.ts` через існуючий PDF-pipeline (Puppeteer chromium).
13. **PDF Н-1** для тяжких/смертельних випадків — шаблон за Постановою КМУ №337.
14. **Cron `safety-briefing-reminder`** — `src/jobs/safety-briefing-reminder.ts`:
    - Знайти всіх Employee активних > 90 днів без `SafetyBriefingAttendee` типу `REPEAT_3M` за останні 90 днів.
    - Згрупувати по firmId + project.
    - Викликати `dispatchNotification` з channel `in-app + telegram` для HR з `isSafetyOfficer=true`.
    - Запис у audit-log.
15. **Інтеграція з Telegram bot** (`bot/commands/safety.ts`):
    - `/incident` — швидке reporting через bot з фото.
    - Reply на нагадування про briefing → "Підтвердити проведено".
16. **Notifications:** додати key-и в `src/lib/notifications/templates/` (incident_reported, briefing_reminder, risk_review_due).
17. **Backfill UI:** для існуючих Employee — кнопка "Зареєструвати вступний інструктаж" (масовий imports).
18. **Tests:** unit + integration (firm-isolation, signature data integrity, risk score calc, cron correctness).
19. **Документація:** `docs/safety/USER_MANUAL.md` для HR-менеджера (як заповнювати, експортувати журнали для Держпраці).
20. **Reliability check + production deploy** (`migrate deploy` only).

---

## Acceptance Criteria

- [ ] HR-користувач створює інструктаж за <90 сек: тема → 5 присутніх → 5 підписів на тачскріні → save.
- [ ] FOREMAN з kiosk PWA повідомляє про near-miss з фото за <90 сек.
- [ ] PDF журналу інструктажів за квартал генерується <5 сек і містить підписи кожного присутнього.
- [ ] Cron надсилає нагадування рівно один раз за 24h на кожного простроченого Employee.
- [ ] Risk Matrix візуалізує ризики так, що клітинки 4×5 і 5×5 (червоні) явно виділяються.
- [ ] Studio user не бачить Group інцидентів і навпаки (firm-isolation тест зелений).
- [ ] Усі підписи зберігаються як base64 PNG, валідуються на мін. кількість штрихів (>3).
- [ ] При DELETE Incident — каскадно видаляються attachments + involved (через `onDelete: Cascade`).
- [ ] Compliance-звіт показує % працівників з актуальним повторним інструктажем у розрізі проєктів.

---

## Testing

- `src/lib/safety/__tests__/risks.test.ts` — riskScore завжди = likelihood × severity, residualRisk ≤ riskScore.
- `src/lib/safety/__tests__/compliance.test.ts` — cron знаходить рівно тих, у кого briefing > 90 днів.
- `src/lib/safety/__tests__/firm-isolation.test.ts` — Studio HR не бачить Group інцидентів.
- `src/lib/safety/__tests__/signature.test.ts` — валідація base64 PNG, відмова на порожній canvas.
- `src/lib/safety/__tests__/incident-attachments.test.ts` — cascade delete.
- `src/lib/safety/__tests__/pdf-journal.test.ts` — PDF містить N rows для N attendees.
- Component test: `SignatureCanvas` undo/clear, мін. довжина штриха.
- E2E (Playwright, опційно): foreman reports incident → manager бачить у списку → resolves → status changes.

Run: `npm run test:unit -- safety`

---

## Open Questions

1. **HSE-роль** — окремий enum `SAFETY_OFFICER` чи `HR + isSafetyOfficer` boolean? Рекомендація: boolean (менше зачіпає RBAC).
2. **Зберігання підписів** — base64 в БД (просто, але великий розмір) чи R2 (PNG-файли)? Рекомендація: для MVP base64, через 6 міс — мігрувати в R2 якщо БД роздується.
3. **Форма Н-1** — генерувати з системи чи лишити paper-only? Рекомендація: генерувати з полів Incident + manual review перед подачею.
4. **Чи потрібен AI-парс фото інциденту** (Anthropic vision → autodetect severity/type)? Рекомендація: phase 2, після збору 50+ датасету.
5. **Multi-firm shared briefing** — інструктаж проведений на спільному об'єкті обох фірм — як обліковувати? Рекомендація: дублювати запис у обох фірмах.
6. **Інтеграція з кадрами:** при звільненні Employee — що робити з її briefing records? Рекомендація: лишати (audit-history), позначати `Employee.isActive=false`.

---

## References

**Українське законодавство:**
- Закон України "Про охорону праці" від 14.10.1992 № 2694-XII
- Постанова КМУ від 17.04.2019 № 337 "Про затвердження Порядку розслідування та обліку нещасних випадків" (форма Н-1)
- НПАОП 0.00-4.12-05 "Типове положення про порядок проведення навчання і перевірки знань з питань охорони праці"
- ДСТУ 12.0.230:2008 (ISO 45001 український аналог)
- Наказ Держпраці №14 — журнали інструктажів

**Технічні бібліотеки:**
- `signature_pad` (https://github.com/szimek/signature_pad) — ~10kb canvas signatures
- `puppeteer` / `playwright` chromium — PDF generation (вже у проєкті для KB-2/KB-3)
- React Flow — для майбутньої візуалізації причинно-наслідкових діаграм (fishbone)

**Внутрішні файли (для розробника):**
- `src/lib/firm/scope.ts` — firm scoping helper
- `src/lib/notifications/dispatch.ts` — multi-channel notify
- `src/lib/auth.ts` — RBAC guards
- `bot/agent/` — Telegram intent routing
