# SRM — Subcontractor Relationship Management — Operations Guide

Розширення модуля контрагентів для відбору і моніторингу субпідрядників. Реалізує: per-проєкт відгуки з 4 критеріями, документи з expiry-нагадуваннями, compliance checks через відкриті дані (ЄДРПОУ + ДАБІ), порівняльний аналіз.

## Деплой

1. **Міграція** — `prisma/migrations/20260525184358_srm_counterparty_extension/migration.sql`. Тільки ADDITIVE (нові enums, nullable колонки на `counterparties`, 3 нові таблиці). Запускати: `npx prisma migrate deploy`.
2. **Регенерувати клієнт**: `npx prisma generate`.
3. **Env vars** (опціонально, без них soft-fail у compliance checks):
   - `CLARITY_PROJECT_API_KEY` — clarity-project.info free tier ~100 req/day
   - `OPENDATABOT_API_KEY` — fallback якщо clarity-project недоступний
4. **Cron** — нові jobs `fireCounterpartyDocumentExpiry` і `fireCounterpartyEdrpouRefresh` уже зареєстровані в [src/app/api/cron/tick/route.ts](../../src/app/api/cron/tick/route.ts). Працюють як інші tick-jobs; idempotency через timestamp-поля у БД.

## Як використовувати

- **Дос'є контрагента**: `/admin-v2/counterparties/<id>` — нові таби "Відгуки", "Документи", "Compliance". Стара структура зберігається у табі "Огляд".
- **Порівняння**: `/admin-v2/counterparties/compare?ids=a,b[,c]` — side-by-side до 3 контрагентів.
- **Manual EDRPOU check**: на табі Compliance кнопка "Перевірити ЄДРПОУ" → виклик clarity-project з 24h cache.
- **Manual DABI check**: на табі Compliance кнопка "Перевірити ДАБІ" → HTML scrape (warning: нестабільний).

## RBAC

- **Read**: SUPER_ADMIN, MANAGER, FINANCIER, ENGINEER, HR.
- **Write (review/document upload)**: SUPER_ADMIN, MANAGER, FINANCIER, HR.
- **Write review**: тільки члени відповідного проєкту АБО менеджер проєкту АБО SUPER_ADMIN.
- **Delete review**: тільки SUPER_ADMIN.
- **Multi-firm isolation**: контрагенти `firmId=null` (shared) видимі обом; інші — ізольовані. Перевіряється `assertCanAccessFirm` + `canAccessCounterparty`.

## Налаштування ключів

### clarity-project.info

1. Зареєструватись на https://clarity-project.info → отримати API key (free tier).
2. Додати у env: `CLARITY_PROJECT_API_KEY=...`.
3. Перезапустити дев-сервер / редеплой.

Free tier ~100 req/day. Внутрішня математика: 500 контрагентів × 1 refresh/міс = ~17/день avg. Якщо паралельно команда тисне "Check now" — може упертись у ліміт. Закласти paid tier як backup для production.

### opendatabot.ua (fallback)

1. https://opendatabot.com — API key.
2. `OPENDATABOT_API_KEY=...`.
3. Викликається автоматично, якщо clarity-project повернув 5xx або timeout.

### ДАБІ

Офіційного API немає. Реалізація через HTML scraping на https://e-licensing.dabi.gov.ua. У UI Compliance таб виводить warning "manual update recommended" — оператор має періодично звіряти вручну.

## Manual override

Якщо інтеграція не може отримати свіжі дані:

- Compliance статус → у адмін-консолі редагувати поле `Counterparty.taxStatus` напряму. Це вшиє запис `manual` у журнал compliance check.
- Ліцензія → редагувати `Counterparty.licenseNumber` / `licenseValidUntil`.

## Cron jobs — поведінка

- **`fireCounterpartyDocumentExpiry`** (тикається кожен tick = 1 хв):
  - Знаходить `CounterpartyDocument.validUntil` ≤ now + 31d.
  - Для кожного — перевіряє пороги 30/7/0 днів.
  - Notify через `notifyUsers` → push/Telegram/email; idempotency через `notified30dAt` / `notified7dAt` / `notifiedExpiredAt`.
  - Адресати: uploader + усі MANAGER/SUPER_ADMIN тієї ж фірми.

- **`fireCounterpartyEdrpouRefresh`** (тикається кожен tick, batch 5):
  - Контрагенти з `taxStatusCheckedAt < now - 30d`.
  - Виклик `lookupEdrpou` (clarity-project → opendatabot fallback).
  - Якщо статус → PROBLEM/BANKRUPT/LIQUIDATED — notify менеджерів.
  - Rate limit 2 сек між викликами.

## Troubleshooting

- **"Сервіс відкритих даних тимчасово недоступний"** (503) — clarity-project і opendatabot обидва впали або не сконфігуровані. Лог-запис у `CounterpartyComplianceCheck(success=false)`.
- **Документ не відображається після upload** — перевірити R2 public URL у env (`R2_PUBLIC_URL`). Метадата зберігається ТІЛЬКИ після успішного PUT у R2.
- **Notification про expiry не прийшла** — перевірити `Notification` table + `TelegramBotUser` linkage; гайд cron повторно не пише після першого спрацювання (idempotency через timestamp-поля). Скинути вручну: `UPDATE counterparty_documents SET notified30dAt=NULL WHERE id=...`.
- **Studio user бачить Group counterparty** — це baseline behavior для `firmId=null` (shared). Якщо контрагент має `firmId`, але видимий не тій фірмі — баг у `canAccessCounterparty`; перевірити сесію.
