# Procurement — Beta scope і відомі обмеження

Цей документ описує поточний стан модуля `procurement` для Closed Beta. Модуль у навігації [admin-v2/_lib/nav.ts](../src/app/admin-v2/_lib/nav.ts) промаркований як `BETA` — це **навмисно**: основний цикл працює end-to-end, але кілька гілок (Phase B) лишаються незавершеними.

## Реалізовано (Phase A)

Повний цикл закупівлі замкнений:

1. **Purchase Request** — створення та редагування ([api/admin/purchase-requests](../src/app/api/admin/purchase-requests/route.ts))
2. **Send RFQ** — формування RFQ з PR і генерація токенів для постачальників ([send-rfq](../src/app/api/admin/purchase-requests/[id]/send-rfq/route.ts))
3. **Supplier public link** — постачальник відкриває RFQ за токеном без логіну ([public/rfq/[token]](../src/app/api/public/rfq/[token]/route.ts))
4. **Submit Bid** — постачальник подає пропозицію ([public/rfq/[token]/bid](../src/app/api/public/rfq/[token]/bid/route.ts))
5. **Compare Bids** — сортування і ranking у UI ([rfqs/[id]/bids](../src/app/api/admin/rfqs/[id]/bids/route.ts))
6. **Award Winner** — атомарна транзакція: створює PO + закриває RFQ + шле email переможцю/невдахам ([rfqs/[id]/award](../src/app/api/admin/rfqs/[id]/award/route.ts))
7. **Create PO** — створюється автоматично при award
8. **Confirm Delivery** — підтвердження поставки (повна або часткова) ([purchase-orders/[id]/confirm-delivery](../src/app/api/admin/purchase-orders/[id]/confirm-delivery/route.ts))
9. **Sync to Finance** — на повну поставку створюється `FinanceEntry(kind=FACT, type=EXPENSE, source=PURCHASE_ORDER)` idempotently
10. **Notifications** — email переможцю/невдахам на award (best-effort, не блокує транзакцію)

Domain models, sequence-based внутрішня нумерація PR/RFQ/PO, role-based access (`SUPER_ADMIN`/`MANAGER`/`FINANCIER`), firm isolation через `resolveFirmScope` — усе на місці.

## Phase B — відомі gaps

### 1. RFQ reminder emails не надсилаються

[api/admin/rfqs/[id]/remind/route.ts:19](../src/app/api/admin/rfqs/[id]/remind/route.ts#L19) оновлює `lastReminderAt` і `remindersCount` на `RFQRecipient`, але листа постачальнику не шле. **Workaround:** Beta-користувачам надсилати нагадування вручну зі свого email-клієнта; в UI RFQ видно `lastReminderAt` як підтвердження що нагадування зафіксовано в системі.

### 2. PDF PO generation відсутня

`PurchaseOrder.pdfUrl` поле є у схемі, але PDF не генерується і не вантажиться в R2. **Workaround:** PO друкувати з браузера (`Cmd+P` зі сторінки PO) — поточна сторінка верстана з урахуванням друку.

### 3. CostCode FK на PurchaseRequestItem не активний

`PurchaseRequestItem.costCodeId` зарезервоване Phase B. Кошти з procurement не агрегуються в budget-matrix per cost-code. **Workaround:** для Beta-фірм cost-tracking PO робиться на рівні `FinanceEntry.category="Закупівлі"` / `subcategory="Поставка матеріалів"` — це працює, але грубіше за code-level breakdown.

### 4. Counterparty rating не показується в порівнянні bids

[api/admin/rfqs/[id]/bids/route.ts:87](../src/app/api/admin/rfqs/[id]/bids/route.ts#L87) повертає `rating: null` — інтеграція з `CounterpartyReview` агрегатом не реалізована. **Workaround:** ranking зараз за ціною + терміном поставки, без історичної оцінки постачальника. PM перевіряє історію вручну через дос'є контрагента (відкривається в drawer).

## Acceptance criteria для зняття BETA badge

- Reminder email шлеться при POST /remind (з тим самим email-template-механізмом, що `sendRfqInvite`).
- PDF PO генерується (наприклад через `@react-pdf/renderer` або сервер-side puppeteer) і вантажиться в R2 з підписаним URL.
- CostCode FK активований + procurement-витрати потрапляють у budget-matrix per code.
- Counterparty rating інтегрований у `rfqs/[id]/bids` response.
- Пройдено повний e2e walkthrough на staging із 3+ постачальниками і чотирма gap-кейсами вище.

## Зв'язані документи

- [BETA_GAPS_AUDIT.md](./BETA_GAPS_AUDIT.md) секція 4.5/5.5 — контекст рішення лишити BETA badge
- [ARCHITECTURE_FOR_CLAUDE.md](../ARCHITECTURE_FOR_CLAUDE.md) — повна архітектура
