# Task 08 — SRM (Subcontractor / Supplier Relationship Management)

> Priority: 🟡 HIGH | Estimate: 3-4 тижні | Owner: ___

## Mission

Перетворити плоский реєстр `Counterparty` на повноцінну **SRM-систему**: ratings (per-проєкт відгуки з 4 критеріями), compliance (ліцензії, ДАБІ, ЄДРПОУ-статус через open data), документи з expiry alerts, сторінка-портрет контрагента, side-by-side порівняння. Замість "просто список контактів" — інструмент відбору і моніторингу.

## Context

- **Існуюча модель** `Counterparty` уже містить базу: `name`, `type`, `roles[]`, `taxId`, `edrpou`, `iban`, `vatPayer`, `phone`, `email`, `address`, `notes`, `defaultPaymentTermsDays`, `preferredPaymentMethod`, `firmId`. Файл: `prisma/schema.prisma:3268-3315`.
- **Multi-firm:** `Counterparty.firmId` уже є — один SUPPLIER може існувати окремо в Group і Studio. SRM розширення зберігає цей принцип; reviews/documents — теж firm-scoped через counterparty.
- **Інтеграції з відкритими даними України:**
  - clarity-project.info / opendatabot — ЄДРПОУ → tax status, basic info.
  - e-licensing.dabi.gov.ua — ДАБІ ліцензії на будівництво.
- **R2** для файлів (LICENSE / PERMIT / CERTIFICATE / INSURANCE / CONTRACT scan).

## Business Goal

- При виборі субпідрядника на новий проєкт менеджер бачить **agreggate rating** + **історію проєктів** + **compliance status** одним кліком.
- 100% контрагентів з ЄДРПОУ мають свіжий tax status (≤30 днів).
- 0 випадків коли працюємо з прострочена ліцензією (alert за 30 днів до expiry).
- Time-to-decision на вибір субпідрядника зменшено: пошук через filtered list з рейтингом + порівняння двох → ~5 хв (проти ~1 год переглядання чатів і email).

## Out of Scope

- Тендерна процедура (RFP/RFQ workflow) — окрема task.
- KYC / AML automated checks (FATF lists) — окрема task.
- E-contract підписання (Дія, KEP) — окрема task.
- Auto-blacklist через скаргу в open data — лише manual `taxStatus` set у rev.1.

## Prerequisites

- [ ] Узгодити: розширюємо `Counterparty` (НЕ створюємо нову модель) — це збереже всі існуючі FK (`FinanceEntry`, `KB2Form`, `KB3Form`, `Project.clientCounterparty`, `SupplierPayment`, `ForemanReportItem`, `SupplierMaterial`).
- [ ] API key для clarity-project.info (free tier ~100 req/day) АБО opendatabot.ua.
- [ ] Перевірити що ДАБІ е-ліцензування має публічний JSON/API (інакше — fallback на ручний HTML scrape з кешуванням).
- [ ] Cron framework (як у task 07) для daily checks.

## 🚨 Parallel Conflicts

- `prisma/schema.prisma` модель `Counterparty` — **критичний** conflict-point. Будь-яка інша task що чіпає Counterparty має координуватися.
- `src/app/admin-v2/counterparties/` — нові сторінки `[id]/page.tsx` і `compare/page.tsx`. Конфлікт якщо паралельно йде redesign списку контрагентів.
- `src/lib/cron/` — нова daily job.
- `src/lib/notifications/` — нові templates (LICENSE_EXPIRING, EDRPOU_STATUS_CHANGED).

## Counterparty — Diff (розширення існуючої моделі)

**Існуючі поля лишаються без змін.** Додаємо:

```prisma
enum LegalForm {
  FOP              // фізична особа-підприємець
  TOV              // товариство з обмеженою відповідальністю
  PE               // приватне підприємство
  PJSC             // публічне акціонерне товариство
  PRJSC            // приватне акціонерне товариство
  STATE            // державне підприємство
  OTHER
}

enum CounterpartyTaxStatus {
  ACTIVE
  PROBLEM          // борги перед бюджетом / проблемне
  SUSPENDED        // призупинено
  BANKRUPT
  LIQUIDATED
  UNKNOWN
}

model Counterparty {
  // === existing fields (НЕ ЗМІНЮВАТИ) ===
  // id, name, type, roles, taxId, edrpou, iban, vatPayer, phone,
  // email, address, notes, isActive, defaultPaymentTermsDays,
  // preferredPaymentMethod, firmId, createdAt, updatedAt + relations

  // === NEW SRM fields ===
  legalForm            LegalForm?
  /// ІНН/РНОКПП (10 цифр) — для FOP. EDRPOU вже існує.
  ipn                  String?
  licenseNumber        String?
  licenseValidUntil    DateTime?
  dabiRegistration     String?
  taxStatus            CounterpartyTaxStatus  @default(UNKNOWN)
  taxStatusCheckedAt   DateTime?
  /// Спеціалізації: ["concrete", "electrical", "fit-out", "plumbing", "facade"]
  specializations      String[]               @default([])
  /// Денормалізований середній рейтинг (1.00..5.00). Перераховується при кожному review.
  avgRating            Decimal?               @db.Decimal(3, 2)
  /// Денормалізований лічильник кількості проєктів (унікальних), де брав участь.
  totalProjects        Int                    @default(0)
  /// Денормалізований лічильник reviews.
  totalReviews         Int                    @default(0)
  /// Назва банку (для зручності UI; iban вже є).
  bankName             String?

  // === NEW relations ===
  reviews              CounterpartyReview[]
  documents            CounterpartyDocument[]
  complianceChecks     CounterpartyComplianceCheck[]
}

model CounterpartyReview {
  id                  String   @id @default(cuid())
  counterpartyId      String
  byUserId            String
  projectId           String

  /// Overall 1..5 (округляється з component scores).
  rating              Decimal  @db.Decimal(2, 1)
  qualityScore        Int      // 1..5
  timelinessScore     Int      // 1..5
  priceScore          Int      // 1..5
  communicationScore  Int      // 1..5

  comment             String?  @db.Text
  reviewedAt          DateTime @default(now())

  counterparty        Counterparty @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)
  by                  User         @relation("CounterpartyReviewAuthor", fields: [byUserId], references: [id])
  project             Project      @relation("CounterpartyReviewProject", fields: [projectId], references: [id], onDelete: Cascade)

  /// Один автор — один відгук per (counterparty, project). Edit існуючого, не дубль.
  @@unique([counterpartyId, byUserId, projectId])
  @@index([counterpartyId])
  @@index([projectId])
  @@map("counterparty_reviews")
}

enum CounterpartyDocumentType {
  LICENSE
  PERMIT
  CERTIFICATE
  INSURANCE
  CONTRACT
  STATUTE          // статут
  REGISTRATION     // витяг з реєстру
  OTHER
}

model CounterpartyDocument {
  id              String   @id @default(cuid())
  counterpartyId  String
  type            CounterpartyDocumentType
  title           String   // людська назва ("Ліцензія ДАБІ №123")
  fileUrl         String   // R2
  fileName        String
  fileSize        Int
  mimeType        String

  issuedAt        DateTime?
  validUntil      DateTime?
  isActive        Boolean  @default(true)

  /// За 30/7/0 днів cron шле нотифікацію (по дню — встановлюємо timestamp).
  notified30dAt   DateTime?
  notified7dAt    DateTime?
  notifiedExpiredAt DateTime?

  uploadedById    String
  uploadedAt      DateTime @default(now())

  counterparty    Counterparty @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)
  uploadedBy      User         @relation(fields: [uploadedById], references: [id])

  @@index([counterpartyId, type])
  @@index([validUntil])
  @@map("counterparty_documents")
}

/// Лог auto-перевірок (для аудиту і дебагу).
model CounterpartyComplianceCheck {
  id              String   @id @default(cuid())
  counterpartyId  String
  source          String   // "clarity-project" | "dabi" | "manual"
  /// Сирий response від open data.
  rawResponse     Json
  /// Результат: змінив taxStatus / licenseValidUntil / no change.
  resultSummary   String
  success         Boolean
  errorMessage    String?
  checkedAt       DateTime @default(now())

  counterparty    Counterparty @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)

  @@index([counterpartyId, checkedAt])
  @@map("counterparty_compliance_checks")
}
```

## Migration Strategy

1. Локальна throwaway-БД: `prisma migrate dev --name srm_counterparty_extension --create-only`.
2. Перевірити що міграція **тільки ADD**:
   - `ALTER TABLE counterparties ADD COLUMN ...` (всі nullable / з default).
   - `CREATE TYPE` для enums.
   - `CREATE TABLE counterparty_reviews / counterparty_documents / counterparty_compliance_checks`.
3. **НЕ повинно бути** `DROP COLUMN` / `ALTER ... TYPE` на існуючих колонках.
4. `prisma migrate deploy` на staging → smoke → prod.
5. Backfill (опційно): `legalForm` inferred з `name` (regex: "ТОВ "..., "ФОП ", "ПП ") — окремий скрипт `scripts/backfill-counterparty-legal-form.ts`.

## ЄДРПОУ validation

- ЄДРПОУ для юр.особи: 8 цифр з контрольною сумою.
- РНОКПП (ІНН) для фіз.особи: 10 цифр з контрольною сумою.
- Алгоритми контрольних сум — стандартні (документація ДФС).
- Утиліта: `src/lib/validators/edrpou.ts`:
  ```typescript
  export function isValidEdrpou(s: string): boolean;     // 8-digit + checksum
  export function isValidRnokpp(s: string): boolean;     // 10-digit + checksum
  export function normalizeTaxId(s: string): string;     // strip spaces/dashes
  ```

## Integrations

### `src/lib/integrations/clarity-project.ts`

```typescript
export interface EdrpouLookupResult {
  edrpou: string;
  name: string;
  legalForm?: LegalForm;
  taxStatus: CounterpartyTaxStatus;
  address?: string;
  founders?: Array<{ name: string; share: number }>;
  raw: unknown;
}

export async function lookupEdrpou(edrpou: string): Promise<EdrpouLookupResult | null>;
```

- Cache 24h (Redis або таблиця `CounterpartyComplianceCheck` — взяти останній success).
- Rate limit: 100/day на free tier → ставити queue + batch.
- Fallback на opendatabot.ua якщо clarity-project не відповідає.

### `src/lib/integrations/dabi-license.ts`

```typescript
export interface DabiLicenseResult {
  licenseNumber: string;
  holderName: string;
  holderEdrpou: string;
  issuedAt: Date;
  validUntil: Date | null;
  scope: string[];   // дозволені види робіт
  isActive: boolean;
  raw: unknown;
}

export async function checkDabiLicense(licenseNumber: string): Promise<DabiLicenseResult | null>;
```

- Якщо немає публічного API — fallback HTML parser з cheerio + кеш у `CounterpartyComplianceCheck`.

## API Endpoints

| Method | Path | Призначення |
|---|---|---|
| GET    | `/api/admin/counterparties` | list з фільтрами `roles`, `specializations`, `minRating`, `taxStatus`, `firmId` scope |
| GET    | `/api/admin/counterparties/:id` | детальний portrait + reviews/docs/projects history |
| PATCH  | `/api/admin/counterparties/:id` | оновити SRM-поля |
| POST   | `/api/admin/counterparties/:id/check-edrpou` | call clarity-project → update `taxStatus`, write `CounterpartyComplianceCheck` |
| POST   | `/api/admin/counterparties/:id/check-dabi` | call ДАБІ → update `licenseValidUntil` |
| GET    | `/api/admin/counterparties/:id/reviews` | список reviews |
| POST   | `/api/admin/counterparties/:id/reviews` | новий review (RBAC: лише members проєкту) → recompute `avgRating` |
| PATCH  | `/api/admin/counterparties/:id/reviews/:reviewId` | edit власного review |
| DELETE | `/api/admin/counterparties/:id/reviews/:reviewId` | delete (admin) |
| GET    | `/api/admin/counterparties/:id/documents` | список documents |
| POST   | `/api/admin/counterparties/:id/documents` | upload (R2) |
| DELETE | `/api/admin/counterparties/:id/documents/:docId` | soft delete (set `isActive=false`) |
| GET    | `/api/admin/counterparties/:id/projects` | історія проєктів (через FinanceEntry / SupplierPayment / KB2Form) |
| GET    | `/api/admin/counterparties/compare?ids=a,b[,c]` | side-by-side data (max 3) |

### `avgRating` recompute

Транзакція при insert/update/delete review:
```sql
UPDATE counterparties
SET avgRating = (
  SELECT ROUND(AVG((qualityScore + timelinessScore + priceScore + communicationScore) / 4.0)::numeric, 2)
  FROM counterparty_reviews WHERE counterpartyId = $1
),
totalReviews = (SELECT COUNT(*) FROM counterparty_reviews WHERE counterpartyId = $1),
totalProjects = (SELECT COUNT(DISTINCT projectId) FROM counterparty_reviews WHERE counterpartyId = $1)
WHERE id = $1;
```

## UI Changes

- `src/app/admin-v2/counterparties/page.tsx` — **розширити** existing list:
  - Filter sidebar: roles, specializations (multi), minRating (slider 1-5), taxStatus, license valid.
  - Колонки таблиці: name + legalForm badge, rating (stars), totalProjects, taxStatus badge, license valid until, actions.
- `src/app/admin-v2/counterparties/[id]/page.tsx` — **нова** портретна сторінка з табами:
  - **Огляд:** базові поля + compliance badges + швидкі actions ("Check ЄДРПОУ now", "Compare", "New review").
  - **Проєкти:** історія участі (з агрегатами: сума оплат, кількість fact-entries).
  - **Відгуки:** список з фільтром по проєкту + form "Write review" для members.
  - **Документи:** upload + list з expiry-status (green/yellow/red).
  - **Compliance:** auto-checks log + manual override `taxStatus` + button "Re-check".
- `src/app/admin-v2/counterparties/compare/page.tsx` — **нова**, query `?ids=a,b[,c]`:
  - Колонки: до 3 контрагентів side-by-side.
  - Рядки: name, legalForm, edrpou, taxStatus, avgRating, scores breakdown, specializations, totalProjects, licenseValidUntil, paymentTerms, документи (count).
- `src/app/admin-v2/counterparties/_components/rating-stars.tsx` — переcory.
- `src/app/admin-v2/counterparties/_components/compliance-badge.tsx`.
- `src/app/admin-v2/counterparties/_components/expiry-indicator.tsx`.
- `src/app/admin-v2/_lib/nav.ts` — badge `count(documents with validUntil < 30 days AND isActive)`.

## Cron Jobs

- **Daily 03:00 UTC** — `src/lib/cron/counterparty-document-expiry.ts`:
  - Скан `CounterpartyDocument` WHERE `isActive AND validUntil IS NOT NULL`:
    - `validUntil - now ≤ 30d AND notified30dAt IS NULL` → notify відповідального (uploadedBy + всі MANAGER firm) + set timestamp.
    - `validUntil - now ≤ 7d AND notified7dAt IS NULL` → notify.
    - `validUntil < now AND notifiedExpiredAt IS NULL` → notify (high priority) + рекомендація set `isActive=false`.
- **Weekly Mon 04:00 UTC** — `src/lib/cron/counterparty-edrpou-refresh.ts`:
  - Контрагенти з `taxStatusCheckedAt < now - 30d` → batch lookup (з rate limit). Notify якщо `taxStatus` змінився на `PROBLEM/BANKRUPT/LIQUIDATED`.

## Implementation Plan

1. [ ] Узгодити з командою diff на `Counterparty` (PR з прев'ю).
2. [ ] Додати enums `LegalForm`, `CounterpartyTaxStatus`, `CounterpartyDocumentType`.
3. [ ] Розширити `Counterparty` + створити `CounterpartyReview`, `CounterpartyDocument`, `CounterpartyComplianceCheck` у schema.
4. [ ] Згенерувати міграцію (тільки ADD).
5. [ ] `src/lib/validators/edrpou.ts` — isValidEdrpou / isValidRnokpp з checksum + tests.
6. [ ] `src/lib/integrations/clarity-project.ts` — API client + cache + rate limit.
7. [ ] `src/lib/integrations/dabi-license.ts` — API client / HTML fallback.
8. [ ] API: розширити existing counterparties endpoints + нові endpoints.
9. [ ] `recomputeRating` helper + виклик у POST/PATCH/DELETE review.
10. [ ] UI: розширення list page (filters + rating column).
11. [ ] UI: детальна сторінка `[id]/page.tsx` з табами.
12. [ ] UI: compare page.
13. [ ] R2 upload helper для documents (reuse якщо існує).
14. [ ] Cron: document expiry notifications.
15. [ ] Cron: weekly ЄДРПОУ refresh.
16. [ ] Notifications templates: LICENSE_EXPIRING_30/7/0, EDRPOU_STATUS_CHANGED.
17. [ ] Tests (див. нижче).
18. [ ] Backfill script для `legalForm` з `name` (опц.).
19. [ ] Документація: `docs/operations/srm-guide.md` + інструкція з ключами clarity-project.

## Acceptance Criteria

- [ ] Розширення `Counterparty` не зламало жодного existing FK / API endpoint (повний typecheck + npm test pass).
- [ ] Існуючий список контрагентів продовжує працювати без змін у БД-даних.
- [ ] `isValidEdrpou("12345678")` повертає правильно за чек-сумою (тест на 20+ реальних ЄДРПОУ).
- [ ] POST review зі score 4/5/4/5 → `avgRating = 4.5` (округлення HALF_UP) + `totalReviews++`.
- [ ] Unique constraint: один user НЕ може створити 2 reviews для тієї ж пари (counterparty, project) — повторний POST редагує існуючий.
- [ ] Check-EDRPOU успішно оновлює `taxStatus` + пише запис у `CounterpartyComplianceCheck`.
- [ ] Cron expiry: документ з `validUntil = tomorrow` → за наступний run відправлено 7d-нотифікацію (раз, не повторно).
- [ ] Multi-firm: Studio user НЕ бачить Group counterparties (existing scope) + НЕ бачить Group reviews/documents.
- [ ] Compare page: 3 контрагенти на одному екрані, всі ключові метрики видимі без скролу на 1920×1080.
- [ ] Detail page lighthouse perf ≥85 (lazy load tabs).
- [ ] Failover: якщо clarity-project недоступний → API повертає 503 з retry-after, не падає.

## Testing

- **Unit:**
  - ЄДРПОУ / РНОКПП checksum (positive + negative cases + edge: leading zeros).
  - Levenshtein name matching (для resolver з task 06, але корисне і тут).
  - `recomputeRating` математика (boundary: 0 reviews → avgRating=null).
  - Cron expiry: simulate `now()` через injectable clock; перевірити що повторно не шле.
- **Integration:**
  - POST review → DB write + counterparty.avgRating updated в тій же транзакції.
  - DELETE review → recompute.
  - Mocked clarity-project response → counterparty оновлено + compliance check записано.
  - Multi-firm: спроба читати чужий counterparty → 404.
- **Manual:**
  - Реальний ЄДРПОУ існуючого контрагента → check works.
  - Upload PDF ліцензії 5 MB → R2 OK.
  - Cron на staging — перевірити що приходить notification у bot.
  - Compare 3 контрагенти візуально.

## Open Questions

- [ ] **Free API quota:** clarity-project free tier 100/day — вистачить? Бо у нас, скажімо, 500 контрагентів × 1 раз/міс = 500/міс → 17/день avg. Так, вистачить. Але якщо паралельно SRM команда буде ще "check now" — може упертися. Закласти paid tier як backup.
- [ ] **ДАБІ API:** перевірити чи є офіційний open data endpoint станом на 2026; якщо ні — HTML scraping + warning у Compliance таб ("manual update recommended").
- [ ] **Reviews privacy:** чи бачить контрагент свої reviews (через client portal)? У rev.1 — НІ (internal only). Дискусія pending.
- [ ] **Soft vs hard delete review:** для аудиту краще soft (додати `deletedAt`). Чи робити?
- [ ] **Specializations taxonomy:** вільні строки vs фіксований enum? Рекомендація: hybrid — є базовий suggested-list (autocomplete), але можна додавати кастомні; зберігаємо як `String[]`.
- [ ] **Compare 2 vs 3 vs N:** дизайнерське рішення на UX. Більше 3 — нечитабельно на 1920px. Залишити max=3.
- [ ] **Rating history chart:** показувати тренд `avgRating` по часу? У rev.2.
- [ ] **NPS-style опитування** після завершення проєкту — auto-prompt PM створити review? У rev.2.
- [ ] **Підтягувати IBAN з ЄДРПОУ?** Деякі open data джерела дають bank accounts. Юридично OK?
- [ ] **Чи дозволити CLIENT бачити reviews по його проєктах?** Pro: прозорість. Cons: можуть тиснути на оцінку. У rev.1 — НІ.

## References

- `prisma/schema.prisma:3268-3315` — поточна модель `Counterparty` (база для розширення).
- `prisma/schema.prisma` — `User`, `Firm`, `Project`, `FinanceEntry`, `SupplierPayment` (для projects history aggregation).
- `src/lib/firm/scope.ts` — `resolveFirmScope` (обовʼязково).
- `src/lib/auth.ts` — `requireRole`.
- `src/lib/notifications/` — notification templates.
- clarity-project API: <https://clarity-project.info/api>
- opendatabot API (backup): <https://opendatabot.ua/api>
- ДАБІ е-ліцензування: <https://e-licensing.dabi.gov.ua>
- ЄДРПОУ checksum алгоритм: ДСТУ 4163-2003.
- Task 06 — `IncomingDocument(type=CONTRACT)` може лінкуватися до `Counterparty` (поточний `linkedEntityType=COUNTERPARTY`); координація flow.
- Task 07 — RFI до зовнішніх осіб (проєктантів) — можуть бути теж `Counterparty(role=DESIGNER)`; у rev.2 інтеграція.
