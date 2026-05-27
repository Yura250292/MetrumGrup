# Beta Module Checklist

Поки навігація показує багато модулів, у Closed Beta ми обіцяємо лише ті, що пройшли реальний end-to-end цикл. Цей файл — джерело правди для PR-описів, support-чату і product-комунікації.

Статус-легенда:
- ✅ — у Beta scope, працює, готовий для зовнішнього користувача
- ⚠️ — у Beta scope, з документованими обмеженнями (див. "Known limitations")
- 🔒 — поза Beta scope (internal-only або вимкнено)

---

## Projects ✅

**Готові сторінки:** `/admin-v2/projects`, `/admin-v2/projects/[id]` (вкладки overview / estimates / RFIs / change-orders / documents / payments / photos / team).
**Готові API:** `/api/admin/projects` (GET/POST/PATCH), `/api/admin/projects/[id]/payments`, `/api/admin/projects/[id]/photos`.
**Multi-firm:** ✅ ізольовано через `resolveFirmScope` ([src/lib/firm/scope.ts](../src/lib/firm/scope.ts)). Тест: [src/lib/firm/__tests__/scope.test.ts](../src/lib/firm/__tests__/scope.test.ts).
**Known limitations:** дашборд-віджет "Розширений вигляд проєктів" поки заглушка ([admin-v2/page.tsx:1111](../src/app/admin-v2/page.tsx#L1111)). Не впливає на core flow — це extra-вид на головній.

## Estimates ✅

**Готові сторінки:** `/admin-v2/estimates` (з робочим client-side пошуком), `/admin-v2/estimates/[id]`, `/admin-v2/estimates/new`, `/ai-estimate-v2` (AI генератор), `/admin-v2/reference-estimates`.
**Готові API:** `/api/admin/estimates/*`, AI pipeline в `src/lib/estimates/`, `src/lib/ai/`.
**Known limitations:** pivot/KB2 інтеграція з financing складна, прикрита тестами в `src/lib/financing/__tests__/`. AI генерація потребує валідних `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`.

## Financing ⚠️

**Готові сторінки:** `/admin-v2/financing/*` (overview, planning, suppliers, KB2, cashflow, budget matrix).
**Готові API:** `/api/admin/financing/*`, foreman reports → finance sync ([src/lib/foreman/](../src/lib/foreman/)).
**RBAC STRICT:** цифри ЗП і фінансові звіти бачить ТІЛЬКИ SUPER_ADMIN. MANAGER/HR/ENGINEER/FINANCIER/FOREMAN/CLIENT — НЕ бачать. Реалізовано через `canViewFinance()`.
**Known limitations:** XLSX-імпорт фактів — Phase A working, але потребує precise column mapping; помилки парсу логуються але не показують user-friendly trace.

## Counterparties / SRM ✅

**Готові сторінки:** `/admin-v2/counterparties` (з робочим EmptyState + інлайн-create), `/admin-v2/counterparties/[id]` (дос'є), `/admin-v2/counterparties/compare`.
**Готові API:** `/api/admin/financing/counterparties/*`, Excel template + import, withOutstanding aggregation.
**Known limitations:** counterparty rating з reviews не агрегується в bid-comparison RFQ (Phase B — див. `PROCUREMENT_BETA_NOTES.md`).

## Documents / Inbox ⚠️

**Готові сторінки:** `/admin-v2/documents/inbox` (drag-drop + EmptyState CTA).
**Готові API:** `/api/admin/documents/upload`, `/api/admin/documents/[id]/link` (Phase A — лише `FINANCE_ENTRY`), AI parse pipeline.
**Known limitations:** document linking працює лише для `FINANCE_ENTRY`. INVOICE / CONTRACT / CERTIFICATE як окремі типи лінків — Phase B ([documents/[id]/link/route.ts:23](../src/app/api/admin/documents/[id]/link/route.ts#L23)). Email-inbox `docs@metrum.ua` — у банері помічено як "наступна фаза".

## RFI ✅

**Готові сторінки:** `/admin-v2/rfis` (реєстр з EmptyState), drill-down drawer на конкретний RFI.
**Готові API:** `/api/admin/rfis/*`, numbering, reminders/escalations cron.
**UX nuance:** створення RFI відбувається в контексті проєкту через `/admin-v2/projects/[id]` → вкладка "RFI" → modal `rfi-create-modal.tsx`. Реєстр `/admin-v2/rfis` — це read-only dashboard, не creation entrypoint.
**Known limitations:** reminders працюють на cron + push, але email-надсилання нагадувань не реалізовано аналогічно procurement (state updates only).

## Change Orders ✅

**Готові сторінки:** `/admin-v2/change-orders` (реєстр з EmptyState), `/admin-v2/change-orders/new`, `/admin-v2/change-orders/[id]`.
**Готові API:** `/api/admin/change-orders/*` (DRAFT → PENDING_PM → PENDING_ADMIN → PENDING_CLIENT → APPROVED/REJECTED), cost+schedule impact.
**Known limitations:** signed PDF generation працює для approved CO; upload-attached PDF — теж OK. AI-suggestions для cost-impact — нема (рахується вручну).

## Procurement ⚠️

**Готові сторінки:** `/admin-v2/procurement` (overview + tabs), `/admin-v2/procurement/requests/[id]`, `/admin-v2/procurement/rfqs/[id]`, `/admin-v2/procurement/orders/[id]`. Публічна сторінка постачальника `/public/rfq/[token]`.
**Готові API:** повний цикл PR → RFQ → public bid → award → PO → confirm delivery → finance sync.
**Status:** **BETA badge ОФІЦІЙНО лишається** в [nav.ts:104](../src/app/admin-v2/_lib/nav.ts#L104) до закриття Phase B gaps.
**Known limitations:** див. [`PROCUREMENT_BETA_NOTES.md`](./PROCUREMENT_BETA_NOTES.md) — reminder emails, PDF PO, CostCode FK, counterparty rating.

## Foreman PWA ✅

**Готові сторінки:** `/foreman/*` (kiosk-режим для виконробів — звіти, AI-парс витрат з тексту/фото/PDF/Excel, інструменти).
**Готові API:** `/api/foreman/reports/*`, AI parse pipeline, manager approval → `FinanceEntry(FACT, source=FOREMAN_REPORT)`.
**Multi-firm:** ✅ працює по firm-scope.

## Client Dashboard ✅

**Готові сторінки:** `/dashboard/*` — client portal (проєкти, документи, фінанси, фото, нотифікації).
**Готові API:** обмежений subset через `/api/projects/*` (не `admin/`).
**ACL:** CLIENT role жорстко обмежений тільки своїми проєктами.

---

## Поза Beta scope

🔒 **AI кошториси у production** — `/ai-estimate-v2` працює, але AI-генерація на сторонніх ключах. Якщо `ANTHROPIC_API_KEY` відсутній — UX має показати degraded mode.
🔒 **`/admin/*` legacy shell** — лишається як redirect-обгортка. Не полірувати. Активний UI — `admin-v2/*`.
🔒 **Telegram bot нотифікації** — `npm run bot:dev` як окремий процес. У Beta-launch не включений.
🔒 **Visualizer** (`/dashboard/visualizer`) — internal demo, лишити прихованим.

## Як використовувати цей файл

- При PR-описі: вкажи модуль (✅ / ⚠️ / 🔒) і чи зачіпає Beta scope.
- При support-зверненні: знайди модуль і обмеження. Якщо проблема — known limitation → відповідь "Phase B / по дорожній карті". Якщо НЕ — ескалація.
- При зміні архітектури: одночасно з кодом онови цей файл (інакше — drift).
