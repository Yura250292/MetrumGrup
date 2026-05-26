# Task 14 — Інтеграція з BAS / 1С / M.E.Doc

> **Priority:** 🟡 SHOULD-HAVE | **Estimate:** 6–8 тижнів (full) / 1 тиждень (MVP-XML export) | **Owner:** ___
> **Спрінт:** після стабілізації financing-моделі та cost codes (Task 01)

---

## Mission

Запровадити **bi-directional синхронізацію** між Metrum Group і українськими бухгалтерськими системами:

1. **BAS Бухгалтерія** (найпопулярніша зараз — спадкоємець 1С в UA після 2022).
2. **1С:Підприємство 8** (legacy, але багато середніх компаній досі на ньому).
3. **M.E.Doc** (де-факто стандарт для електронних податкових накладних і ПДВ-звітів).

Кінцева ціль — фінансовий менеджер не дублює введення фактур/актів між Metrum і бухгалтерією. Бухгалтерія залишається system of record для податкового обліку, Metrum — для управлінського + операційного.

---

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, Anthropic + Gemini, Jest.
**Канонічна UI:** `src/app/admin-v2/*`.
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожна firm може мати окремі AccountingSystem connections.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Фінансові інтеграції бачить тільки SUPER_ADMIN (`canViewFinance()`).
**Existing finance:** `src/lib/financing/` (KB2, cashflow, budget matrix).
**Cost codes:** від Task 01 — обов'язкові для mapping на план рахунків UA (631/361/311/301/23/91-94).

---

## Business Goal

**Перестати дублювати введення документів** між Metrum і BAS/1С/M.E.Doc.

**Метрики успіху:**
- ≥80% видаткових накладних, створених у Metrum, авто-пушаться в BAS/1С без втручання.
- Платежі з банк-клієнта, імпортовані в BAS, авто-pull-яться в Metrum і матчаться з рахунками.
- Час реконсиляції фактичних платежів зменшується з 4 годин/тиждень до 30 хв.
- Жодного дубля документа на стороні бухгалтерії (idempotency через SyncMapping).

**Чому це окупається:**
- Бухгалтер економить 10–15 годин/тиждень на ручному введенні.
- Реальні платежі видно в Metrum того ж дня (не post-factum через місяць).
- Підготовка до перевірки податкової — за хвилини, бо все consistent.

---

## 🎯 MVP-стратегія (рекомендована, якщо ресурсу мало)

**Замість повної bi-directional інтеграції — почати з 1 тиждня:**
- Експорт `FinanceEntry` і `CompletionAct` у **XML формат для ручного імпорту в M.E.Doc** (формат — стандартні XSD з податкової).
- Це закриває 60% болю (електронні податкові накладні) за 1 тиждень замість 8.
- Через 3-6 міс — оцінити чи дійсно треба автоматичний bi-directional sync чи XML-експорт достатньо.

Повний обсяг (нижче) — для замовника, який хоче "натиснув кнопку → все в BAS".

---

## Out of Scope

- ❌ Інтеграція з зарубіжними системами (SAP, QuickBooks, Xero) — UA-only фокус.
- ❌ Прямий доступ до банк-клієнта (Приват24/Monobank Business API) — окремий task.
- ❌ Генерація звітів для ДПС напряму (Декларація з прибутку, ПДВ-звіт) — це M.E.Doc job.
- ❌ Авто-mapping ШІ (AI-suggests-which-account) — phase 2.
- ❌ Real-time webhooks з BAS/1С (вони не підтримують push — pull-only через polling).

---

## Prerequisites

- [ ] **CRITICAL:** Task 01 (Cost Codes / WBS) має бути завершений — без cost codes неможливий mapping на план рахунків.
- [ ] **Узгодити з користувачем:** яку систему інтегруємо першою — BAS Бухгалтерія чи 1С Підприємство? (BAS — рекомендую, бо актуальніша.)
- [ ] **Узгодити:** on-premise vs cloud версію BAS у замовника — від цього залежить транспорт (HTTP/REST vs файловий XML обмін).
- [ ] **Узгодити з бухгалтером:** mapping cost code → план рахунків UA (наприклад, 23.04.01 "Зварювальні роботи" → рахунок 23 "Виробництво").
- [ ] **Отримати тестові credentials** до тестової інстанції BAS/1С/M.E.Doc.
- [ ] **Узгодити підхід до encryption:** ENV-key чи KMS (Cloudflare)? Рекомендую ENV-key з ротацією раз на рік.
- [ ] **Узгодити MVP-XML vs full integration** — від цього залежить estimate (1 тиждень vs 8 тижнів).

---

## 🚨 Parallel Conflicts

| Файл                                          | Конфлікт з           | Стратегія              |
| --------------------------------------------- | -------------------- | ---------------------- |
| `prisma/schema.prisma`                        | **усі task-и**       | 🔴 серіалізувати       |
| `src/app/admin-v2/_lib/nav.ts`                | 02, 03, 12, 13       | 🔴 серіалізувати       |
| `src/lib/financing/entries.ts` (sync hooks)   | 01, 02, 13           | 🔴 узгодити            |
| `FinanceEntry` model (`externalRefs JSON?`)   | 01, 02, 13           | 🟡 узгодити            |
| `Counterparty` model (`externalRefs JSON?`)   | 02                   | 🟡 узгодити            |
| `CompletionAct` model (`externalRefs JSON?`)  | 07                   | 🟡 узгодити            |
| `src/lib/integrations/*`                      | нові — без конфлікту | 🟢                     |
| `src/lib/secrets/encrypt.ts`                  | новий — без конфлікту | 🟢                     |
| `package.json` (нові deps: `node-forge`, `xml2js`, `node-cron`) | усі | 🟡 одночасно |

---

## Data Model (Prisma)

```prisma
enum AccountingSystemType {
  BAS
  ONE_C
  MEDOC
}

enum AccountingSystemStatus {
  ACTIVE
  ERROR
  DISABLED
  CONFIGURING
}

enum SyncDirection {
  PUSH
  PULL
}

enum SyncEntityType {
  FINANCE_ENTRY
  COUNTERPARTY
  PROJECT
  COMPLETION_ACT
  PAYMENT
}

enum SyncStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  CONFLICT
  DEAD_LETTER
}

enum SyncOperation {
  PUSH_INVOICE
  PUSH_ACT
  PUSH_COUNTERPARTY
  PULL_PAYMENTS
  PULL_INVOICES
  HEALTH_CHECK
}

model AccountingSystem {
  id                    String                  @id @default(cuid())
  firmId                String                                          // ✅ multi-firm
  type                  AccountingSystemType
  name                  String                                          // "BAS Production" / "1С УПП Warehouse"
  baseUrl               String?                                         // URL endpoint (для REST/OData)
  credentialsEncrypted  String                  @db.Text                // AES-256-GCM encrypted JSON {login, password, apiKey}
  config                Json                                            // {chartOfAccountsMap, vatRate, currency, exchangeUrl, ...}
  isActive              Boolean                 @default(false)
  status                AccountingSystemStatus  @default(CONFIGURING)
  lastSyncAt            DateTime?
  lastHealthCheckAt     DateTime?
  lastError             String?                 @db.Text
  createdById           String
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt

  firm                  Firm                    @relation(fields: [firmId], references: [id])
  createdBy             User                    @relation(fields: [createdById], references: [id])
  mappings              SyncMapping[]
  logs                  SyncLog[]
  queue                 SyncQueue[]

  @@unique([firmId, type, name])
  @@index([firmId, isActive])
}

model SyncMapping {
  id                  String              @id @default(cuid())
  accountingSystemId  String
  ourEntity           SyncEntityType                                    // напр. FINANCE_ENTRY
  ourEntityId         String                                            // cuid у нашій БД
  externalEntityId    String                                            // GUID/код у зовнішній системі
  externalEntityType  String?                                           // "Документ.СчетФактура" / "Контрагент"
  fieldMapping        Json?                                             // snapshot field-mapping використаного при sync
  lastSyncedAt        DateTime            @default(now())
  syncHash            String?                                           // hash payload для conflict detection
  createdAt           DateTime            @default(now())

  accountingSystem    AccountingSystem    @relation(fields: [accountingSystemId], references: [id], onDelete: Cascade)

  @@unique([accountingSystemId, ourEntity, ourEntityId])
  @@unique([accountingSystemId, externalEntityId])
  @@index([accountingSystemId, ourEntity])
}

model SyncLog {
  id                  String              @id @default(cuid())
  accountingSystemId  String
  direction           SyncDirection
  entityType          SyncEntityType
  entityId            String?                                           // наш cuid або externalEntityId
  operation           SyncOperation
  status              SyncStatus
  requestPayload      Json?
  responsePayload     Json?
  errorMessage        String?             @db.Text
  syncedAt            DateTime            @default(now())
  ms                  Int?

  accountingSystem    AccountingSystem    @relation(fields: [accountingSystemId], references: [id], onDelete: Cascade)

  @@index([accountingSystemId, syncedAt])
  @@index([status, syncedAt])
}

model SyncQueue {
  id                  String              @id @default(cuid())
  accountingSystemId  String
  operation           SyncOperation
  payload             Json
  status              SyncStatus          @default(QUEUED)
  attempts            Int                 @default(0)
  maxAttempts         Int                 @default(5)
  nextAttemptAt       DateTime            @default(now())
  lastError           String?             @db.Text
  createdAt           DateTime            @default(now())
  startedAt           DateTime?
  finishedAt          DateTime?

  accountingSystem    AccountingSystem    @relation(fields: [accountingSystemId], references: [id], onDelete: Cascade)

  @@index([accountingSystemId, status, nextAttemptAt])
}

// === Зміни в існуючих моделях ===

model FinanceEntry {
  // ... існуючі поля
  externalRefs        Json?                                             // {"BAS:1": "guid-xxx", "MEDOC:1": "..."}
}

model Counterparty {
  // ... існуючі поля
  externalRefs        Json?
  // Українська специфіка — додаткові поля для bookkeeping integration:
  edrpou              String?                                           // ЄДРПОУ / РНОКПП
  ipnVat              String?                                           // ПДВ-ІПН (12 знаків)
  bankAccountIban     String?                                           // IBAN UA…
}

model CompletionAct {
  // ... існуючі поля
  externalRefs        Json?
}
```

---

## Migration Strategy

1. Локально `prisma migrate dev --name add_accounting_integrations --create-only`.
2. Перевірити що `externalRefs Json?` додано до 3-х моделей без data loss.
3. **Encryption key bootstrap:** ENV `ACCOUNTING_ENCRYPTION_KEY` (32 байти base64). Генерувати через `openssl rand -base64 32`. Зберігати в Railway secrets.
4. Production: `prisma migrate deploy`.
5. Перший AccountingSystem створюється через UI wizard у `configuring` status — реальна синхронізація не запускається доки `isActive=false`.

---

## Adapter Interface (універсальний)

```ts
// src/lib/integrations/adapter.ts

export interface ExternalRef {
  systemId: string;       // AccountingSystem.id
  externalId: string;     // GUID/код у зовнішній
  externalType?: string;
}

export interface PaymentRecord {
  externalId: string;
  date: Date;
  amount: number;
  currency: string;
  counterpartyEdrpou?: string;
  invoiceExternalId?: string;
  description?: string;
}

export interface AccountingAdapter {
  type: AccountingSystemType;

  pushInvoice(entry: FinanceEntry, system: AccountingSystem): Promise<ExternalRef>;
  pullPayments(system: AccountingSystem, since: Date): Promise<PaymentRecord[]>;
  pushAct(act: CompletionAct, system: AccountingSystem): Promise<ExternalRef>;
  pushCounterparty(cp: Counterparty, system: AccountingSystem): Promise<ExternalRef>;
  healthCheck(system: AccountingSystem): Promise<boolean>;
}
```

Адаптери: `src/lib/integrations/bas-buhgalteria/`, `src/lib/integrations/one-c/`, `src/lib/integrations/medoc/`.

---

## BAS Бухгалтерія — специфіка

**Транспорт:**
- **REST API через json-обмін:** конфігурується на стороні BAS — публікація HTTP-сервісу "Обмен" (точка входу `/hs/exchange/`). Базова auth.
- **Альтернатива (для on-premise без зовнішнього доступу):** XML файловий обмін через спільну папку (SMB) або S3/R2.

**Об'єкти, що мапаються:**
| Metrum                  | BAS                          | Notes                                 |
|-------------------------|------------------------------|---------------------------------------|
| `Counterparty`          | `Справочник.Контрагенты`     | EDRPOU = ключ matching                |
| `Project`               | `Справочник.Проекты` (опційно) | може не використовуватись у BAS    |
| `FinanceEntry` (PLAN)   | — (не пушається)             | план — це Metrum-only                 |
| `FinanceEntry` (FACT, expense) | `Документ.СчетФактураПолученный` + проводки 631/91-94 | через cost code → рахунок |
| `FinanceEntry` (FACT, income)  | `Документ.СчетФактураВыданный` + 361/70 | |
| `CompletionAct` (КБ-2)  | `Документ.АктВыполненныхРабот` | вже існує в Task 07           |
| Платежі з банк-клієнта  | `Документ.ПлатежноеПоручениеВходящее/Исходящее` | PULL only, daily cron |

**План рахунків UA (mapping):**
- 631 — Розрахунки з постачальниками
- 361 — Розрахунки з покупцями
- 311 — Поточний рахунок у банку
- 301 — Каса
- 23 — Виробництво (для basic CAPEX/OPEX)
- 91 — Загальновиробничі витрати
- 92 — Адміністративні витрати
- 93 — Витрати на збут
- 94 — Інші витрати операційної діяльності
- 70 — Доходи від реалізації
- 644/641 — ПДВ

Mapping per-firm зберігається у `AccountingSystem.config.chartOfAccountsMap`:
```json
{
  "23.04.01": "23.4.1",      // Зварювальні роботи (наш cost code → суб-рахунок BAS)
  "08.41.01": "23.5.2",      // Підлоги керамічна плитка
  "default-income": "70.1",
  "default-expense": "91"
}
```

---

## 1С:Підприємство 8 — специфіка

**Транспорт:**
- **REST через Web-сервіси 1С** (конфігурація має експортувати HTTP-сервіс) — потребує 1С:Підприємство 8.3.10+.
- **OData протокол** (1С 8.3.5+) — нативний, але обмежений по логіці (нема комплексних операцій).
- Авторизація — Basic auth із 1С-юзером "ОбмінДаних".

**Об'єкти — аналогічно BAS** (1С → BAS мав однакову конфігураційну модель до 2022).

**Особливості:**
- 1С 7.7 (стара) — **не підтримується**, користувачам пропонувати міграцію на BAS.
- Конфігурації "УПП", "Бухгалтерія для України", "Управління торгівлею" — різні набори об'єктів. На MVP — фокус на "Бухгалтерія для України 2.0".

---

## M.E.Doc — специфіка

**Призначення:** не повна бухгалтерія, а саме **електронні податкові накладні + ПДВ-звіти** для ДПС.

**Транспорт:**
- **M.E.Doc API** (HTTP) — комерційна ліцензія потрібна.
- **Файловий обмін через XSD** (по стандартам ДПС) — найпростіший шлях для MVP. Створити XML за стандартним шаблоном "ПН" (податкова накладна) → користувач вручну імпортує в M.E.Doc.

**Що пушаємо:**
- `CompletionAct` + ПДВ-частина → податкова накладна (`J1201010`) для покупця-юрособи.
- Реєстр виданих ПН на місяць.

**Що НЕ робимо** (це робота M.E.Doc):
- Відправка ПН до ДПС (M.E.Doc сама шле).
- Реєстрація в ЄРПН.
- ПДВ-звіт (J0200109).

---

## API Endpoints

```
# Connections
GET    /api/admin/integrations/accounting                 # list per firm
POST   /api/admin/integrations/accounting                 # create (status=CONFIGURING)
GET    /api/admin/integrations/accounting/:id
PATCH  /api/admin/integrations/accounting/:id             # update config
DELETE /api/admin/integrations/accounting/:id             # SUPER_ADMIN only
POST   /api/admin/integrations/accounting/:id/test        # healthCheck
POST   /api/admin/integrations/accounting/:id/activate
POST   /api/admin/integrations/accounting/:id/deactivate

# Mapping wizard
GET    /api/admin/integrations/accounting/:id/mappings    # list SyncMapping
POST   /api/admin/integrations/accounting/:id/mappings/initial-import # bulk import existing counterparties
POST   /api/admin/integrations/accounting/:id/mappings/resolve-conflict

# Sync ops
POST   /api/admin/integrations/accounting/:id/sync/push   # manual push для конкретного entity
POST   /api/admin/integrations/accounting/:id/sync/pull   # manual pull (наприклад, "забрати платежі за тиждень")
GET    /api/admin/integrations/accounting/:id/logs        # SyncLog list

# Conflict resolution
GET    /api/admin/integrations/accounting/conflicts       # all firm-wide conflicts
POST   /api/admin/integrations/accounting/conflicts/:logId/resolve

# MVP: XML export
GET    /api/admin/integrations/medoc/export-xml           # ?period=2026-04, type=invoices
```

RBAC: усі — **SUPER_ADMIN only** (фінансові credentials).

---

## UI Changes

### `src/app/admin-v2/settings/integrations/accounting/`

```
src/app/admin-v2/settings/integrations/accounting/
  page.tsx                              # список connections + status badges
  new/page.tsx                          # wizard: type → baseUrl → credentials → test → activate
  [id]/
    page.tsx                            # overview, статистика sync-ів
    mappings/page.tsx                   # SyncMapping per entity type
    logs/page.tsx                       # SyncLog з фільтрами
    config/page.tsx                     # chart of accounts mapping editor
  conflicts/page.tsx                    # firm-wide conflict resolution dashboard
```

### Компоненти

- `src/components/integrations/ConnectionWizard.tsx` — крокова форма (стиль `multi-step`).
- `src/components/integrations/ChartOfAccountsMapEditor.tsx` — таблиця cost code → BAS account.
- `src/components/integrations/SyncLogTable.tsx` — virtualized table з фільтрами.
- `src/components/integrations/ConflictResolver.tsx` — side-by-side порівняння Metrum vs External.
- `src/components/integrations/StatusBadge.tsx` — кольоровий бейдж (ACTIVE/ERROR/DISABLED).

### Навігація

`src/app/admin-v2/_lib/nav.ts`: під "Налаштування" → "Інтеграції" → "Бухгалтерія" (icon: Calculator), `SUPER_ADMIN` only.

---

## Implementation Plan

### Phase 0 — MVP XML export (1 тиждень)

1. **Узгодити з користувачем:** MVP-XML чи full integration?
2. Якщо MVP — створити `src/lib/integrations/medoc/xml-export.ts` з шаблонами J1201010 (ПН) і J0200109 (реєстр).
3. UI `/admin-v2/settings/integrations/medoc/export` — вибір періоду → download .xml.
4. Тест на 5 справжніх ПН → ручний імпорт в M.E.Doc → ОК.
5. **STOP HERE** якщо бізнес-функція покриває біль.

### Phase 1 — BAS REST integration (3 тижні)

6. **Encryption service:** `src/lib/secrets/encrypt.ts` — AES-256-GCM з ENV key. Тести roundtrip.
7. **Prisma schema:** 4 моделі + extensions (externalRefs Json?, EDRPOU, IBAN).
8. **Adapter interface:** `src/lib/integrations/adapter.ts`.
9. **BAS adapter:** `src/lib/integrations/bas-buhgalteria/`:
   - `client.ts` — HTTP client з retry + timeout
   - `transformers/` — Metrum → BAS payload
   - `push-invoice.ts`, `pull-payments.ts`, `push-act.ts`, `push-counterparty.ts`, `health-check.ts`
   - `index.ts` — реалізує `AccountingAdapter`
10. **Queue worker:** `src/lib/integrations/queue-worker.ts` — окремий процес `npm run integrations:worker`. Polling `SyncQueue` з exponential backoff (1s, 4s, 16s, 64s, 256s).
11. **Cron pull:** daily 06:00 — pull payments з BAS за останні 7 днів, match по `invoiceExternalId`.
12. **Conflict detection:** при PUSH перевіряємо `syncHash` — якщо external entity змінилась (BAS повертає `dataVersion`) → status `CONFLICT` + manual resolve.
13. **API endpoints** (12 routes).
14. **UI:** connection wizard + mappings editor + logs table.
15. **Інтеграція з financing-service:** при `FinanceEntry.create/update` — якщо AccountingSystem active → enqueue `PUSH_INVOICE`.

### Phase 2 — 1С Підприємство (2 тижні)

16. `src/lib/integrations/one-c/` — на основі BAS adapter (схожі payload-и).
17. OData fallback для конфігурацій без HTTP-сервісу.
18. Тестування на тестовому 1С:Підприємство 8.3.

### Phase 3 — M.E.Doc full API (2 тижні)

19. `src/lib/integrations/medoc/` — HTTP API client (commercial license required).
20. Push ПН + pull статусу реєстрації в ЄРПН.

### Phase 4 — UI polish + docs (1 тиждень)

21. **Tests** для всіх adapters (contract tests з mocked external systems).
22. **Documentation:** `docs/integrations/BAS_SETUP.md`, `1C_SETUP.md`, `MEDOC_SETUP.md` — інструкції налаштування на стороні бухгалтерії.
23. **Operational runbook:** як debug-ити sync failures, як rotate-ити encryption key.

---

## Acceptance Criteria

- [ ] **MVP:** SUPER_ADMIN експортує XML за період → файл відкривається в M.E.Doc без помилок.
- [ ] **Full:** новий `FinanceEntry` (expense) автоматично з'являється в BAS у `СчетФактураПолученный` за <60 сек.
- [ ] **Idempotency:** повторний PUSH того ж entry → BAS не створює дубль (через `SyncMapping.externalEntityId`).
- [ ] **Conflict:** редагування entity в BAS вручну + повторний PUSH з Metrum → status `CONFLICT`, UI показує diff.
- [ ] **Pull:** платежі з банк-клієнта (імпортовані в BAS вранці) з'являються в Metrum того ж дня.
- [ ] **Encryption:** credentials у БД зашифровані, при `SELECT credentialsEncrypted FROM AccountingSystem` — base64 ciphertext.
- [ ] **Multi-firm:** Group connection не бачить Studio queue/logs.
- [ ] **Retry:** transient error (HTTP 500) → 5 retries з backoff → якщо все падає → `DEAD_LETTER` + alert SUPER_ADMIN.
- [ ] **Health check:** UI показує `ERROR` якщо `healthCheck()` не пройшов 3 рази поспіль.
- [ ] **Audit:** SyncLog має requestPayload + responsePayload для кожної sync ops (90 днів retention).

---

## Testing

- `src/lib/secrets/__tests__/encrypt.test.ts` — encrypt/decrypt roundtrip, wrong key fails.
- `src/lib/integrations/__tests__/adapter-contract.test.ts` — кожен adapter імплементує всі методи інтерфейсу.
- `src/lib/integrations/bas-buhgalteria/__tests__/transformers.test.ts` — Metrum → BAS payload мапінг (з fixture).
- `src/lib/integrations/bas-buhgalteria/__tests__/push-invoice.test.ts` — mock HTTP → перевіряємо payload + idempotency.
- `src/lib/integrations/__tests__/queue-worker.test.ts` — retry backoff timing, dead-letter після 5 attempts.
- `src/lib/integrations/__tests__/conflict-detection.test.ts` — syncHash mismatch → CONFLICT.
- `src/lib/integrations/__tests__/firm-isolation.test.ts` — Studio worker не бачить Group queue.
- `src/lib/integrations/medoc/__tests__/xml-export.test.ts` — XML валідний проти XSD (через `libxmljs2`).

Run: `npm run test:unit -- integrations`

---

## Open Questions

1. **MVP-XML vs full integration** — пріоритет?
2. **BAS on-premise vs cloud у замовника** — від цього транспорт (REST vs file).
3. **1С версія:** які саме конфігурації у замовників (БУХ 2.0 / УПП / УТ)?
4. **M.E.Doc API license** — комерційна ($), варто чи XML-обмін достатньо?
5. **Encryption key management** — ENV vs Cloudflare KMS? (ENV простіше для старту, KMS — enterprise-grade.)
6. **Conflict resolution UX** — manual review (рекомендую) чи auto-merge (ризиковано)?
7. **Multi-firm:** одна `AccountingSystem` на firmId чи можна декілька (наприклад, BAS + M.E.Doc одночасно)? Рекомендація: декілька, але різних типів.
8. **Що з історичними даними?** При першій активації — pull усе чи тільки з дня активації? Рекомендація: pull з дня активації, історія через окремий "Initial import" wizard.

---

## References

**Українські системи:**
- BAS Бухгалтерія (cloud + on-premise): https://www.bas-soft.eu/
- 1С:Підприємство 8 (legacy в UA): https://1c.ua/
- M.E.Doc (електронні податкові): https://medoc.ua/

**Документація з обміну:**
- BAS — "Обмен данными через REST API" (вбудована довідка конфігурації)
- 1С — "Сервисы 1С для интеграции с другими системами" (its.1c.ru)
- ДПС — XSD-схеми податкових документів: https://tax.gov.ua/elektronna-zvitnist/platnikam-podatkiv-pro/

**Технічні бібліотеки:**
- `node-forge` — AES-256-GCM шифрування
- `xml2js` / `fast-xml-parser` — XML serialization
- `libxmljs2` — XSD валідація
- `node-cron` — daily pull jobs (або pg-boss schedule з Task 13)
- `axios` / native fetch — HTTP клієнт

**Український план рахунків:**
- Наказ Мінфіну №291 від 30.11.1999 — План рахунків бухгалтерського обліку

**Внутрішні файли:**
- `src/lib/firm/scope.ts` — firm scoping helper
- `src/lib/financing/entries.ts` — точка інструментації (`onEntryUpserted` hook)
- `src/lib/auth.ts` — `canViewFinance()` guard
- `src/lib/notifications/dispatch.ts` — alert SUPER_ADMIN при DEAD_LETTER
