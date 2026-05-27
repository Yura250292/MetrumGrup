# Beta Support Runbooks

Швидкі recipe-чек-листи для типових Beta-інцидентів. Кожен пункт: **симптом → діагностика → фікс / workaround → коли ескалація**.

> Audit reference: BETA_GAPS_AUDIT.md §6.2.

---

## 1. Auth issues

### Користувач не може залогінитись (показує "Невірний email або пароль")

**Діагностика:**
1. Підтвердити email регістр (`.toLowerCase()` має відбутись на стороні форми; перевір що користувач вводить точний).
2. Глянути `User.isActive` через Studio: `npm run db:studio` → User → filter by email. Якщо `isActive=false` — заблокований.
3. Чи юзер з потрібного `firmId`? Studio-юзер не може зайти в Group-обліковий, і навпаки.
4. In-memory rate-limit per email — 5 невдалих спроб → 15-хв блок ([src/lib/auth-rate-limit.ts](../src/lib/auth-rate-limit.ts)).

**Фікс:**
- Активувати: оновити `User.isActive = true` через Studio.
- Скинути пароль через `forgot-password` flow (генерує токен + email через `nodemailer`).
- Очистити rate-limit: рестарт Next.js процесу (in-memory лочка не персистентна).

**Ескалація:** якщо токен не приходить — див. розділ "Email delivery" нижче.

### "Token invalid" при reset-password

**Діагностика:** `PasswordResetToken.expiresAt < now` або токен використано (`usedAt != null`).

**Фікс:** ще раз ініціювати `forgot-password` — створить новий токен.

---

## 2. Receipts / Documents (OCR)

### Документ "застряг" у статусі PROCESSING

**Діагностика:**
1. Перевір AI-логи: парс падає тихо? Шукай `[doc-parse]` warnings у Railway logs.
2. R2 URL валідний? `IncomingDocument.fileUrl` має повертати 200.
3. `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` задані в env?
4. PDF без OCR-шару — AI може повертати `confidence < 0.1`, треба робити reupload з фото.

**Фікс:**
- Reset документ: `UPDATE "IncomingDocument" SET status='FAILED', "errorMessage"='OCR timeout' WHERE id=...`. Тоді у UI кнопка "Спробувати ще".
- Якщо багато документів зависли — рестарт `documents-worker` (якщо запущений) або просто перезавантажити сторінку (workflow polled на frontend).

### Документ розпарсився але "Привʼязати до FinanceEntry" не працює

**Діагностика:**
- Phase A підтримує лише `FINANCE_ENTRY` linkage. Інші типи (INVOICE/CONTRACT/CERTIFICATE) — Phase B ([documents/[id]/link/route.ts:23](../src/app/api/admin/documents/[id]/link/route.ts#L23)).
- Якщо `autoLink.counterpartyId === null` — AI не зміг визначити постачальника, треба вибрати вручну.

**Фікс:** використати ручний форм — вибрати counterparty + project, повторити `Link`.

---

## 3. Financing imports

### XLSX-імпорт фактів падає на конкретному рядку

**Діагностика:**
1. Колонка `Дата` має бути у форматі `dd.mm.yyyy` або Excel-date-serial. Текстова "27 травня" — не парситься.
2. `Сума` — number, без пробілів-розділювачів. `12 345,67` — OK; `12,345.67` — буде помилка.
3. Counterparty має існувати по точному match `name` (без regional). Створи перед імпортом.
4. Перевір env: `R2_*` ключі — для збереження вихідного XLSX-аудит-файлу.

**Фікс:** використати template (`/api/admin/financing/import/template`). Запустити `npm run db:studio` → перевірити чи створились нові `FinanceEntry`.

### KB2 / pivot не рахує правильно після імпорту

**Діагностика:** `prisma migrate` пропущено? `npm run db:push` — для дев. Або інваріант поламано — `npm run test:unit -- financing` має покривати.

**Фікс:** запустити `npm run test:unit` — якщо червоне у `financing/__tests__/`, не пушити. Шукати останні зміни в `src/lib/financing/`.

---

## 4. Procurement / Supplier flow

### Постачальник відкриває public RFQ link → 404

**Діагностика:**
- Токен правильний? Має бути base64url, ~32 символи, унікальний на `RFQRecipient.accessToken`.
- RFQ статус — не `CLOSED` чи `CANCELLED`? Закриті RFQ повертають 404 для public read.
- Чи `RFQRecipient.bidSubmittedAt != null` — постачальник вже подав, лінк лочиться.

**Фікс:** PM має створити новий `RFQRecipient` через UI або викликати `POST /api/admin/rfqs/[id]/recipients` (якщо є).

### Reminder не доходить постачальнику

**Очікувано** — Phase B gap ([rfqs/[id]/remind/route.ts:19](../src/app/api/admin/rfqs/[id]/remind/route.ts#L19)). Сервер оновлює `lastReminderAt` але email НЕ шле.

**Workaround:** PM шле нагадування вручну через email-клієнт. У UI `lastReminderAt` фіксує що нагадування зареєстровано в системі.

### Award не створив PO

**Діагностика:**
- Транзакція упала на partial commit? Перевір audit log в `AuditLog` (`type=PROCUREMENT_AWARD`).
- `Bid.status` лишилось `SUBMITTED` замість `WON` — транзакція не закомітилась.

**Фікс:** перевірити `prisma.purchaseOrder.findFirst({ where: { winningBidId: bid.id } })`. Якщо нема — повторити award (idempotent через `winningBidId` unique constraint).

---

## 5. Stuck document/link flows

### "Перевірити" tab у inbox показує документ, але кнопка `Link` неактивна

**Діагностика:**
- Hidden required field — наприклад `Сума` після AI parse `null` → backend reject.
- Counterparty не існує (deleted?) — `autoLink.counterpartyId` invalid.

**Фікс:** через UI "Редагувати" → задати missing fields → повторити Link.

### Документ `LINKED` але `FinanceEntry` не з'явився

**Діагностика:**
- Race condition: `tx.financeEntry.create` упав, але `tx.incomingDocument.update` пройшов. Шукай audit log.

**Фікс:** ручне створення `FinanceEntry` через `/admin-v2/financing/new` з тими ж полями + posting `documentId` field manual.

---

## 6. Email delivery

### `forgot-password` / award notifications не доходять

**Діагностика:**
- `RESEND_API_KEY` / `SMTP_*` env задані?
- Адреса не в spam-папці одержувача?
- Чи `npm run` запущено з production env (Railway) — local dev часто не має SMTP set.

**Фікс:** перевір `sendNotificationEmail` log в Railway. Якщо `provider error: rate_limit` — Resend / SMTP перевищив ліміт; ескалація до admin.

---

## 7. Production hotfix через Claude

⚠️ **DB:**
- ❌ `prisma migrate diff --shadow-database-url <PROD>` — нікoлi.
- ❌ `migrate reset`, `db push --accept-data-loss` на БД з даними.
- ✅ `prisma migrate deploy`, `prisma db push` (без деструктивних прапорів) — OK.
- Інцидент 2026-05-22 у пам'яті (див. CLAUDE.md).

## Ескалація

Якщо runbook не покриває симптом:
1. Зафіксувати: env, role юзера, exact stack trace, час.
2. Telegram-канал dev-team (`#metrum-dev`).
3. Створити issue з міткою `beta-blocker` + посилання на user-report.
