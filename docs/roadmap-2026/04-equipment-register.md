# Task 04 — Equipment Register

> Priority: 🔴 MUST-HAVE | Estimate: 3-4 тижні | Owner: ___

## Mission

Перетворити існуючий примітивний `Equipment` (CRUD табличка у `admin-v2/resources/equipment`) на повноцінний реєстр техніки/обладнання: статус, поточне місцезнаходження (проєкт + GPS), відповідальний user, історія переміщень, maintenance schedule, QR-коди для друку, foreman scanner. Алерти у dashboard ("ТО через X год", "не повернуто Y днів"). GPS-integration з трекерами (Teltonika/GalileoSky) — лише stub-адаптер для майбутнього.

## Context

- **Equipment вже існує** у `prisma/schema.prisma:996-1012` з мінімальними полями: `name, type, serialNumber, status (enum AVAILABLE/IN_USE/MAINTENANCE/DECOMMISSIONED), currentLocation, purchaseDate, purchaseCost, notes, currentProjectId`.
- **EquipmentStatus enum** у `schema.prisma:1838` — `DECOMMISSIONED` зараз, треба перейменувати на `RETIRED`? → НІ, тримаємо `DECOMMISSIONED` для backward compat, мапимо в UI як "Списано".
- Існуюча UI: `src/app/admin-v2/resources/equipment/page.tsx` — список з пошуком і modal створення. Розширюємо, не переписуємо.
- Foreman PWA: `src/app/foreman/*` — додаємо нову зону `equipment/`.
- Stack: Next.js 15, Prisma + PG, Cloudflare R2 (фото), `@zxing/library` для QR scan, `qrcode` npm для генерації PNG.
- Multi-firm: Equipment → додаємо `firmId String?` (зараз його немає!) + index. Studio і Group — окремі реєстри.

## Business Goal

Бетонозмішувачі, генератори, риштування, інструмент мігрує між об’єктами без обліку. Втрати/списання щомісяця — $300-1500. Maintenance робиться "як згадаємо" → поломки в розпал сезону.

Метрика:
- **0% "втраченого" обладнання за квартал** (тобто всі переміщення задокументовані через QR scan).
- **Кількість позапланових ремонтів ↓ на 40%** через регулярне ТО.
- **Time-to-locate**: знайти конкретний відбійник по серійнику ≤ 30 с (зараз — телефонувати 5 прорабам).

## Out of Scope

- Реальна GPS-телеметрія з Teltonika/GalileoSky — тільки interface/stub `EquipmentTelemetryAdapter` + одна mock-реалізація. Інтеграція з реальним постачальником — окремий task.
- Bluetooth Beacon локалізація на складі — окремий task.
- Інтеграція з 1C/Bitrix24 для амортизації — окремо.
- Mobile-native app (iOS/Android native) — лишаємось PWA.
- Калькуляція амортизації по формулі (лінійна/прогресивна) — поки що `currentValue` ручне поле.

## Prerequisites

- [ ] Питання користувачу: який QR-стандарт використовуємо — URL (`https://erp.metrum.../e/{token}`) чи raw token? (URL зручніше: будь-який смартфон → камера → відкриє у браузері без app)
- [ ] Питання користувачу: розмір QR на наклейці (рекомендую 50×50мм, ламінована)
- [ ] Задача 03 — конфлікт по `prisma/schema.prisma`; серіалізувати 03 → 04.
- [ ] Перевірити, чи Equipment вже має submissions через API — щоб не зламати існуючих клієнтів зміною статусу.

## 🚨 Parallel Conflicts

Цей task редагує:
- `prisma/schema.prisma:996-1012` (Equipment — ALTER) + `1838-1843` (enum EquipmentStatus — додаємо `RETIRED`? або лишаємо `DECOMMISSIONED`). **КОНФЛІКТ із 03 і 05**.
- `src/app/admin-v2/resources/equipment/page.tsx` — повне переосмислення list (фільтри + статуси). **Конфлікт з будь-яким, хто чіпає equipment UI**.
- `src/app/admin-v2/_lib/nav.ts` — додаємо підрозділ "Техніка → Алерти", "Техніка → Ремонти". **Конфлікт з усіма nav-міняючими**.
- `src/app/foreman/page.tsx` — додаємо tile "Моя техніка" + scanner shortcut. **КОНФЛІКТ з 03** (forms tile теж тут).
- `src/lib/constants.ts` — `EQUIPMENT_STATUS_LABELS` уже є (`src/lib/constants.ts`), розширюємо.
- `public/sw.js` — додаємо cache route для `/foreman/equipment/*`. **Конфлікт з SW-міняючими 03/05**.
- R2 lifecycle: новий префікс `equipment/{id}/photo` та `equipment/{id}/maintenance/{recordId}/*`.

## Data Model (Prisma)

### Розширення існуючого Equipment

```prisma
model Equipment {
  id                       String          @id @default(cuid())
  firmId                   String?         // NEW: multi-firm
  name                     String
  type                     String
  category                 String?         // NEW: вільний тег (excavator, generator, scaffold, hand_tool, vehicle)
  serialNumber             String?         @unique
  qrCodeId                 String?         @unique // NEW: короткий nanoid(10) для QR URL
  status                   EquipmentStatus @default(AVAILABLE)
  currentLocation          String?         // free-text legacy
  currentProjectId         String?
  currentResponsibleUserId String?         // NEW
  locationLat              Float?          // NEW
  locationLng              Float?          // NEW
  locationUpdatedAt        DateTime?       // NEW
  photoR2Key               String?         // NEW
  purchaseDate             DateTime?
  purchaseCost             Decimal?        @db.Decimal(12, 2)
  currentValue             Decimal?        @db.Decimal(12, 2) // NEW
  totalHoursOperated       Decimal         @default(0) @db.Decimal(10, 2) // NEW
  notes                    String?
  createdAt                DateTime        @default(now())
  updatedAt                DateTime        @updatedAt

  firm                  Firm?                 @relation(fields: [firmId], references: [id])
  currentProject        Project?              @relation(fields: [currentProjectId], references: [id])
  currentResponsibleUser User?                @relation("EquipmentResponsible", fields: [currentResponsibleUserId], references: [id])
  movements             EquipmentMovement[]
  maintenanceSchedules  MaintenanceSchedule[]
  maintenanceRecords    MaintenanceRecord[]

  @@index([firmId, status])
  @@index([currentProjectId])
  @@index([currentResponsibleUserId])
  @@map("equipment")
}

/// Розширити enum (нічого не видаляємо для backward compat):
enum EquipmentStatus {
  AVAILABLE
  IN_USE
  MAINTENANCE
  DECOMMISSIONED  // legacy, мапиться у UI як "Списано"
  RETIRED         // NEW alias; нові записи → RETIRED
  LOST            // NEW: повідомлено про втрату/крадіжку
}
```

### Нові моделі

```prisma
/// Лог переміщення: між проєктами / користувачами / складом.
/// fromXxx = null означає "було без призначення" (на складі / без відповідального).
model EquipmentMovement {
  id              String   @id @default(cuid())
  equipmentId     String
  fromProjectId   String?
  toProjectId     String?
  fromUserId      String?
  toUserId        String?
  byUserId        String   // хто зафіксував рух (сам прораб через scan або менеджер)
  source          EquipmentMovementSource @default(MANUAL)
  notes           String?
  at              DateTime @default(now())

  equipment    Equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  fromProject  Project?  @relation("EquipmentMovementFromProject", fields: [fromProjectId], references: [id])
  toProject    Project?  @relation("EquipmentMovementToProject", fields: [toProjectId], references: [id])
  fromUser     User?     @relation("EquipmentMovementFromUser", fields: [fromUserId], references: [id])
  toUser       User?     @relation("EquipmentMovementToUser", fields: [toUserId], references: [id])
  byUser       User      @relation("EquipmentMovementBy", fields: [byUserId], references: [id])

  @@index([equipmentId, at])
  @@index([toProjectId, at])
  @@map("equipment_movements")
}

enum EquipmentMovementSource {
  MANUAL       // менеджер з admin-v2
  QR_SCAN      // foreman через scanner
  GPS_AUTO     // майбутнє: телематика
  IMPORT
}

/// Графік ТО: інтервал у годинах напрацювання АБО у днях календарних
/// (першочергово спрацьовує те, що настало раніше).
model MaintenanceSchedule {
  id                 String                  @id @default(cuid())
  equipmentId        String
  type               MaintenanceScheduleType @default(REGULAR)
  name               String                  // "Зміна оливи", "Інспекція тросів"
  intervalHours      Decimal?                @db.Decimal(8, 2)
  intervalDays       Int?
  lastMaintenanceAt  DateTime?
  lastHours          Decimal?                @db.Decimal(10, 2)
  nextDueAt          DateTime?               // обчислюється кроном
  nextDueHours       Decimal?                @db.Decimal(10, 2)
  isActive           Boolean                 @default(true)
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  equipment Equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)

  @@index([equipmentId])
  @@index([nextDueAt, isActive])
  @@map("maintenance_schedules")
}

enum MaintenanceScheduleType {
  REGULAR
  INSPECTION
  CERTIFICATION  // напр. сертифікація крана
}

/// Факт виконаного ТО / ремонту.
model MaintenanceRecord {
  id                  String              @id @default(cuid())
  equipmentId         String
  scheduleId          String?             // якщо це регулярне ТО за графіком
  type                MaintenanceRecordType @default(REGULAR)
  performedAt         DateTime
  performedById       String
  hoursAtMaintenance  Decimal?            @db.Decimal(10, 2)
  cost                Decimal?            @db.Decimal(12, 2)
  vendor              String?
  notes               String?
  createdAt           DateTime            @default(now())

  equipment   Equipment            @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  schedule    MaintenanceSchedule? @relation(fields: [scheduleId], references: [id])
  performedBy User                 @relation("MaintenanceRecordPerformer", fields: [performedById], references: [id])
  attachments MaintenanceAttachment[]

  @@index([equipmentId, performedAt])
  @@map("maintenance_records")
}

enum MaintenanceRecordType {
  REGULAR
  REPAIR
  INSPECTION
  CERTIFICATION
}

model MaintenanceAttachment {
  id       String   @id @default(cuid())
  recordId String
  r2Key    String
  fileName String
  contentType String
  sizeBytes   Int
  createdAt   DateTime @default(now())

  record MaintenanceRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  @@index([recordId])
  @@map("maintenance_attachments")
}
```

## Migration Strategy

1. **Backfill `firmId` для existing Equipment** — окремий SQL у migration: `UPDATE equipment SET firm_id = 'metrum-group' WHERE firm_id IS NULL;` (поки що всі — Group; Studio обладнання адмін перепризначить вручну).
2. **Backfill `qrCodeId`** — окремий node-скрипт `scripts/backfill-equipment-qr-codes.ts` (бо nanoid у SQL незручно). Генерує `qrCodeId = nanoid(10)` для всіх де NULL.
3. **NOT NULL constraint на qrCodeId** додаємо ПІСЛЯ backfill, у наступній міграції.
4. `prisma migrate dev --create-only --name equipment_register` локально.
5. Перевірити, що ALTER на існуючу `equipment` — тільки ADD COLUMN nullable (без NOT NULL!) + ADD INDEX.
6. Production: `migrate deploy` → backfill scripts → друга міграція з NOT NULL constraint.

🚨 **DB safety**: ніколи не використовувати `migrate diff --shadow-database-url` проти prod. Тільки local throwaway-БД.

## API Endpoints

### Admin

- `GET    /api/admin/equipment?status=&projectId=&q=` — list з пагінацією, firmId scope
- `POST   /api/admin/equipment` — створити (автогенерує qrCodeId)
- `GET    /api/admin/equipment/:id` — детальна картка + останні рухи + ТО календар
- `PUT    /api/admin/equipment/:id`
- `DELETE /api/admin/equipment/:id` — soft (status=RETIRED), реальний DELETE заборонений якщо є movements/records
- `POST   /api/admin/equipment/:id/assign` — body: `{ projectId?, userId? }` → створює EquipmentMovement
- `POST   /api/admin/equipment/:id/photo` — multipart → R2 → photoR2Key
- `GET    /api/admin/equipment/:id/qr.png` — PNG 512×512, query `?size=512&label=true`
- `GET    /api/admin/equipment/:id/qr-sheet.pdf` — A4 сітка з N однакових QR (для друку наклейок)
- `GET    /api/admin/equipment/:id/movements?limit=` — audit trail
- `POST   /api/admin/equipment/:id/maintenance-schedule` — CRUD ТО графіків
- `PUT    /api/admin/equipment/:id/maintenance-schedule/:sid`
- `DELETE /api/admin/equipment/:id/maintenance-schedule/:sid`
- `POST   /api/admin/equipment/:id/maintenance-record` — body + attachments
- `GET    /api/admin/equipment/alerts` — `{ maintenanceDue: [...], notReturned: [...], lost: [...] }`

### Foreman

- `GET    /api/foreman/equipment/mine` — обладнання де `currentResponsibleUserId == me`
- `POST   /api/foreman/equipment/scan` — body: `{ qrCodeId, action: 'TAKE' | 'RETURN' | 'TRANSFER', toUserId?, projectId? }` → atomic transaction: load + status check + create movement + update equipment.
- `GET    /api/foreman/equipment/:qrCodeId/preview` — швидкий quick-view при наведенні камери (status, current responsible)

**Atomic "take" race resolution:**

```ts
// у /api/foreman/equipment/scan handler:
await prisma.$transaction(async (tx) => {
  const eq = await tx.equipment.findUnique({
    where: { qrCodeId },
    select: { id: true, status: true, currentResponsibleUserId: true, currentProjectId: true }
  });
  if (!eq) throw new HttpError(404, 'NOT_FOUND');
  if (action === 'TAKE' && eq.status === 'IN_USE' && eq.currentResponsibleUserId !== userId) {
    throw new HttpError(409, 'ALREADY_TAKEN', { responsibleUserId: eq.currentResponsibleUserId });
  }
  // далі update + movement
}, { isolationLevel: 'Serializable' }); // PG: SERIALIZABLE → друга транзакція отримає 40001 → retry-once у wrapper
```

### Cron jobs

- `cron/maintenance-due-check` — щогодини: для всіх active MaintenanceSchedule — обчислити `nextDueAt` (з `lastMaintenanceAt + intervalDays`) і `nextDueHours` → set; flag `isDueSoon` для алертів.
- `cron/not-returned-check` — щодня: для Equipment з `status=IN_USE` та `currentResponsibleUserId NOT NULL` де останній movement > 30 днів → push notification менеджеру.

## UI Changes

### Admin (admin-v2)

- `src/app/admin-v2/resources/equipment/page.tsx` — переробити: фільтри (status, project, responsible, category), сортування, bulk-actions (assign multiple), кнопка "Друк QR-наклейок"
- `src/app/admin-v2/resources/equipment/[id]/page.tsx` **NEW** — картка обладнання: header (фото, name, status, QR), tabs: Загальне | Переміщення | ТО | Документи
- `src/app/admin-v2/resources/equipment/[id]/_components/EquipmentHeader.tsx`
- `src/app/admin-v2/resources/equipment/[id]/_components/MovementsTab.tsx`
- `src/app/admin-v2/resources/equipment/[id]/_components/MaintenanceTab.tsx` — calendar з due + history records + create-record modal
- `src/app/admin-v2/resources/equipment/[id]/_components/QrCodePanel.tsx` — preview + download PNG + “Print sheet”
- `src/app/admin-v2/resources/equipment/_components/AssignModal.tsx`
- `src/app/admin-v2/dashboard/_components/EquipmentAlertsWidget.tsx` **NEW** — на головному дашборді: “ТО через X год” + “Не повернуто Y днів”
- `src/app/admin-v2/_lib/nav.ts` — підрозділ "Техніка → Алерти" окремий пункт

### Foreman PWA

- `src/app/foreman/equipment/page.tsx` **NEW** — “Моя техніка”: список з фото + status + кнопка “Повернути”
- `src/app/foreman/equipment/scan/page.tsx` **NEW** — повноекранний scanner (`@zxing/library` з `BrowserMultiFormatReader`), при detect → confirm dialog (TAKE/RETURN/TRANSFER)
- `src/app/foreman/equipment/[qrCodeId]/page.tsx` **NEW** — fallback якщо QR відкрили з нативної камери → отримуємо URL `https://erp.metrum../e/{qrCodeId}` → переадресація сюди → дії
- `src/app/foreman/page.tsx` — додати tile "Моя техніка" + shortcut “Сканувати”
- `src/app/foreman/_components/EquipmentScanFAB.tsx` — floating action button з shortcut

### Shared lib

- `src/lib/equipment/qr.ts` — генерація PNG (`qrcode` npm), URL builder, parser
- `src/lib/equipment/movements.ts` — `recordMovement(tx, args)` helper (єдиний source of truth для логів)
- `src/lib/equipment/maintenance.ts` — `computeNextDue(schedule, equipment)` + cron handlers
- `src/lib/equipment/telemetry/adapter.ts` **NEW** — interface `EquipmentTelemetryAdapter { getLocation(equipmentId): Promise<{lat,lng}|null>; getHours(equipmentId): Promise<number|null> }`
- `src/lib/equipment/telemetry/mock.ts` — mock реалізація для dev
- `src/lib/equipment/telemetry/teltonika-stub.ts` — пустий stub (throws NotImplemented) — щоб interface був задокументований
- `src/lib/constants.ts` — оновити `EQUIPMENT_STATUS_LABELS` (RETIRED, LOST)

## Implementation Plan

1. [ ] **Schema розширення Equipment** (день 1): ALTER ADD COLUMN (nullable), enum доповнення.
2. [ ] **Schema нових моделей** (день 1): EquipmentMovement, MaintenanceSchedule/Record/Attachment.
3. [ ] **Local migration + dry-run review** (день 2).
4. [ ] **Backfill scripts** (день 2): firmId, qrCodeId.
5. [ ] **API admin: CRUD + movements + photo** (день 3-5).
6. [ ] **API admin: maintenance** (день 5-6).
7. [ ] **API foreman: scan/take/return + race-safe transaction** (день 6-7).
8. [ ] **QR generation lib + endpoint** (день 7).
9. [ ] **UI картка обладнання** (тиждень 2): tabs + усі компоненти.
10. [ ] **UI list розширення** (тиждень 2): фільтри + bulk + assign modal.
11. [ ] **Foreman scanner** (тиждень 2-3): `@zxing/library` + permission flow + offline-tolerant (queue scan для пізніше).
12. [ ] **Foreman "моя техніка"** (тиждень 3).
13. [ ] **Cron jobs** (тиждень 3): maintenance-due-check + not-returned-check.
14. [ ] **Dashboard alerts widget** (тиждень 3).
15. [ ] **Telegram notifications** (тиждень 3-4): maintenance due (DM до responsible + manager), not-returned (DM до manager).
16. [ ] **Telemetry adapter interface + mock** (тиждень 4).
17. [ ] **PDF QR-sheet generator** (тиждень 4).
18. [ ] **Tests** (паралельно): unit + integration + e2e scan flow.
19. [ ] **Seed test fixture** (тиждень 4): 20 equipment з різними станами.
20. [ ] **Beta + rollout** (тиждень 4): друк наклейок, тренінг прорабів.

## Acceptance Criteria

- [ ] Адмін створює equipment → автоматично згенерований qrCodeId; PNG QR доступний за 1 клік; PDF A4-sheet з 12 однаковими QR друкується коректно.
- [ ] Прораб сканує QR → бачить current status; при `TAKE` → status=IN_USE, currentResponsibleUserId=me, рух у логу.
- [ ] **Race test**: два прораби одночасно сканують той самий QR з action=TAKE → один отримує 200, інший — 409 з `responsibleUserId` поля.
- [ ] Maintenance schedule з intervalDays=30 і lastMaintenanceAt=сьогодні → nextDueAt = сьогодні+30, після cron alerts widget показує його за 3 дні до.
- [ ] Soft-delete (status=RETIRED) не ламає історію movements/records (вони лишаються видимі).
- [ ] Multi-firm: Studio прораб бачить ТІЛЬКИ Studio equipment; cross-firm scan → 404.
- [ ] Equipment з photo: фото показується у списку (thumbnail 64×64) та у картці (full).
- [ ] Lighthouse PWA score для `/foreman/equipment` ≥ 90; scanner page завантажується ≤ 3 с на 3G.
- [ ] Backfill scripts idempotent: повторний запуск НЕ генерує нові qrCodeId (where qrCodeId IS NULL).
- [ ] `getNextDue` (unit-test): для kombo (intervalDays=10, intervalHours=50) повертає мінімум з двох.

## Testing

- **Unit:**
  - `qr.test.ts` — генерація + parse URL + invalid input.
  - `maintenance.test.ts` — `computeNextDue` edge cases (тільки hours / тільки days / обидва / null lastMaintenanceAt).
  - `movements.test.ts` — recordMovement valid state transitions; invalid (RETIRED → IN_USE) → throw.
- **Integration:**
  - `equipment.crud.int.test.ts` — повний CRUD + firmId scope.
  - `equipment.scan.race.int.test.ts` — два concurrent POST `/scan` → 1×200, 1×409; serializability retry-once працює.
  - `maintenance.cron.int.test.ts` — створити schedule, прокрутити cron, перевірити nextDueAt + alerts endpoint.
  - `equipment.movements.audit.int.test.ts` — assign → reassign → return; перевірити повний log + timestamps.
- **Manual / E2E:**
  - Playwright: builder e2e — створити equipment, згенерувати QR, надрукувати sheet, scan на симульованій камері (MediaDeviceMock).
  - Mobile manual: real iPhone + Android: scan, low-light, наклейка з шорсткою плівкою (тестуємо decoding reliability).
  - Offline: flight mode → scan → queue → online → sync.

## Open Questions

- [ ] QR URL домен: окремий short (`qr.metrum.../e/{token}`) чи main (`erp.metrum../e/{token}`)? Short — швидше для друку, але вимагає окремий DNS.
- [ ] Чи дозволяти foreman TAKE без projectId (тобто "на склад → у мою кишеню")?
- [ ] Hours tracking: вручну (foreman вводить) чи з телематики? Зараз — лише вручну при maintenance record.
- [ ] Цінник амортизації: лінійна формула чи ручне `currentValue`? Поки що ручне, але треба запитати CFO.
- [ ] Які саме metrics показувати у equipment-alerts widget — limit-top 10 чи всі?
- [ ] Перейменувати `DECOMMISSIONED` → `RETIRED` (alias) чи лишити обидва?

## References

- `prisma/schema.prisma:996-1012` — Equipment (extend)
- `prisma/schema.prisma:1838-1843` — EquipmentStatus enum (extend)
- `src/app/admin-v2/resources/equipment/page.tsx` — existing list (rebuild)
- `src/lib/constants.ts` — EQUIPMENT_STATUS_LABELS
- `src/app/foreman/_components/*` — foreman PWA conventions
- `prisma/schema.prisma:740-895` — ForemanReportAttachment (pattern для MaintenanceAttachment)
- Memory: `project_metrum_full_firm_isolation`
- Memory: `project_metrum_foreman_role`
- `@zxing/library` docs: https://github.com/zxing-js/library
- `qrcode` npm: https://github.com/soldair/node-qrcode
