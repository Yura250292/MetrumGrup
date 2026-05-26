# Task 09 — Procurement: RFQ → Bids → PO

> Priority: 🟡 HIGH | Estimate: 4–5 тижнів | Owner: ___

## Mission

Побудувати повноцінний procurement-цикл у Metrum: PM формує `PurchaseRequest` з BoQ (позиції з cost-code), розсилає його обраним постачальникам як `RFQ` (Request For Quotation) через публічні токен-лінки **без обов'язкової реєстрації**, постачальники заповнюють бід-форму, PM бачить side-by-side порівняння в матриці "позиція × постачальник", обирає переможця → система атомарно створює `PurchaseOrder` і маркує інші біди `LOST`, шле email-сповіщення. Усі потоки firm-scoped, з audit-log і PDF-генерацією PO.

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini, Jest.
**Канонічна UI:** `src/app/admin-v2/*` (НЕ `/admin/*` — це legacy redirect).
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope` з `src/lib/firm/`. Постачальники й біди ізольовані по firm.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Створення RFQ — MANAGER+ENGINEER+SUPER_ADMIN. Award — MANAGER+SUPER_ADMIN. Фінансові цифри (суми по PO) — лише SUPER_ADMIN через `canViewFinance()` (інші бачать "—").
**Foreman flow** не торкаємо.
**Тести:** `src/lib/**/__tests__/*.test.ts` + `npm run test:unit`.

## Business Goal

- Скоротити цикл закупки з ~2 тижнів (email-листування) до ≤ 3 днів.
- Прозоре порівняння (а не "PM вибрав знайомого") — економія ≥ 7–12% на матеріалах за рахунок конкуренції.
- Електронний слід (хто, коли, що, по якій ціні) для аудиту і захисту від кикбеків.
- Метрика успіху: 80% закупівель >50 000 ₴ проходить через RFQ-цикл (а не direct PO), середня кількість бідів на RFQ ≥ 3, медіанний час "RFQ_SENT → PO_ISSUED" ≤ 72 год.

## Out of Scope

- Інтеграція з Prozorro / тендерними майданчиками (тільки внутрішній RFQ).
- Aukro-style зворотні аукціони (тільки одноразовий збір цін).
- Автоматичне списання зі складу при доставці (Inventory — окремий модуль).
- Платежі по PO (це робить існуючий `FinanceEntry` workflow — лише посилаємось).
- AI-парсинг прайсів постачальників у форматі Excel — лише ручне введення в публічну форму (AI-парсинг — окремий task).

## Prerequisites

- [ ] Task 01 (Cost Codes / WBS) — `CostCode` model готова, `PurchaseRequestItem.costCodeId` бажано не nullable.
- [ ] Task 08 (Subcontractor Portal / SRM) — `Counterparty` має поля `isSupplier`, `rating`, `categoryTags[]`, плюс публічний `Counterparty.contactEmail`. Якщо 08 ще не злив у main — можна тимчасово використовувати плоский email-список (degraded mode), але RFQ-recipient має посилатись на `Counterparty.id`.
- [ ] Email-провайдер сконфігурований (SMTP / Resend). Перевірити `src/lib/email/` або налаштувати.
- [ ] R2 bucket для PDF PO (можна reuse існуючий `documents` bucket).

## 🚨 Parallel Conflicts

| Файл / артефакт                                | З ким серіалізуватись                |
| ---------------------------------------------- | ------------------------------------ |
| `prisma/schema.prisma`                         | **усі task-и** — комітити міграцію відразу |
| `src/app/admin-v2/_lib/nav.ts` (нова вкладка)  | 01, 02, 04, 05, 07, 08, 12           |
| `Counterparty` model (додаємо `purchaseOrders`, `bids` back-relations) | 08 (SRM) — узгодити з ним назви |
| `Project` model (back-relations PurchaseRequest/PO) | 02, 05, 07 — лише relations, низький ризик |
| `FinanceEntry` (новий `source = PURCHASE_ORDER`) | 01, 02, 06, 10 — додати enum varіант без зміни writer-логіки |
| `src/lib/email/templates/`                     | 08 (теж шле invites постачальникам) — рознести у різні файли |

## Data Model (Prisma)

```prisma
enum PurchaseRequestStatus {
  DRAFT
  RFQ_SENT
  BIDS_COLLECTED
  PO_ISSUED
  CLOSED
  CANCELLED
}

enum RFQStatus {
  DRAFT
  SENT
  COLLECTING
  CLOSED
}

enum BidStatus {
  DRAFT
  SUBMITTED
  WON
  LOST
  WITHDRAWN
}

enum PurchaseOrderStatus {
  DRAFT
  SENT
  CONFIRMED
  PARTIALLY_DELIVERED
  DELIVERED
  CANCELLED
}

model PurchaseRequest {
  id             String                 @id @default(cuid())
  firmId         String
  firm           Firm                   @relation(fields: [firmId], references: [id])
  projectId      String?
  project        Project?               @relation("ProjectPurchaseRequests", fields: [projectId], references: [id], onDelete: SetNull)
  requestedById  String
  requestedBy    User                   @relation("PurchaseRequestRequester", fields: [requestedById], references: [id])
  status         PurchaseRequestStatus  @default(DRAFT)
  /// Дата, до якої потрібен матеріал на майданчику.
  neededBy       DateTime?
  /// Орієнтовний бюджет (для внутрішнього sanity-check).
  estimatedBudget Decimal?              @db.Decimal(12, 2)
  notes          String?
  items          PurchaseRequestItem[]
  rfqs           RFQ[]
  /// Згенерований внутрішній номер: "PR-2026-0001".
  internalNumber String                 @unique
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@index([firmId, status])
  @@index([projectId])
  @@map("purchase_requests")
}

model PurchaseRequestItem {
  id              String          @id @default(cuid())
  requestId       String
  request         PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  costCodeId      String?
  /// Lazy ref — щоб уникнути cross-task залежності, FK ставиться окремою міграцією
  /// після того, як Task 01 (Cost Codes) злився у main.
  description     String
  qty             Decimal         @db.Decimal(12, 3)
  unit            String
  /// JSON: марка, ДСТУ, морозостійкість, тощо. Напр.:
  /// {"brand":"М250","frost":"F100","standard":"ДСТУ Б В.2.7-46:2010"}
  specifications  Json?
  sortOrder       Int             @default(0)
  bidItems        BidItem[]

  @@index([requestId])
  @@index([costCodeId])
  @@map("purchase_request_items")
}

model RFQ {
  id                String         @id @default(cuid())
  purchaseRequestId String
  purchaseRequest   PurchaseRequest @relation(fields: [purchaseRequestId], references: [id], onDelete: Cascade)
  deadline          DateTime
  status            RFQStatus      @default(DRAFT)
  /// Окремий публічний токен для read-only прев'ю всього RFQ
  /// (PM може дати лінк "ось що ми збираємо"). Бідовий доступ — через RFQRecipient.accessToken.
  publicLinkToken   String         @unique @default(cuid())
  /// Internal number "RFQ-2026-0001"
  internalNumber    String         @unique
  recipients        RFQRecipient[]
  bids              Bid[]
  closedAt          DateTime?
  closedById        String?
  closedBy          User?          @relation("RFQCloser", fields: [closedById], references: [id])
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@index([status, deadline])
  @@map("rfqs")
}

model RFQRecipient {
  id              String   @id @default(cuid())
  rfqId           String
  rfq             RFQ      @relation(fields: [rfqId], references: [id], onDelete: Cascade)
  counterpartyId  String
  counterparty    Counterparty @relation("CounterpartyRFQRecipients", fields: [counterpartyId], references: [id])
  /// Email на момент відправки (snapshot, бо контакт у Counterparty може змінитись).
  emailSnapshot   String
  /// Унікальний токен для бідової форми. Cryptographically random (crypto.randomBytes(32).toString('base64url')).
  accessToken     String   @unique
  sentAt          DateTime @default(now())
  viewedAt        DateTime?
  bidSubmittedAt  DateTime?
  /// Idempotency: відправили лист, але не дочекались відповіді — зберігаємо last reminder.
  lastReminderAt  DateTime?
  remindersCount  Int      @default(0)

  @@unique([rfqId, counterpartyId])
  @@index([accessToken])
  @@map("rfq_recipients")
}

model Bid {
  id                  String       @id @default(cuid())
  rfqId               String
  rfq                 RFQ          @relation(fields: [rfqId], references: [id], onDelete: Cascade)
  counterpartyId      String
  counterparty        Counterparty @relation("CounterpartyBids", fields: [counterpartyId], references: [id])
  status              BidStatus    @default(DRAFT)
  /// Сума по всіх BidItem (denormalised для швидкого ORDER BY).
  totalPrice          Decimal      @db.Decimal(12, 2)
  currency            String       @default("UAH")
  /// До коли дійсна ця ціна.
  validUntil          DateTime?
  /// Текстом: "50% передоплата, 50% після поставки", "по факту 7 днів".
  paymentTerms        String?
  /// Кількість календарних днів від PO до поставки.
  deliveryTermsDays   Int?
  notes               String?
  items               BidItem[]
  submittedAt         DateTime?
  /// Якщо переможець — PO, що з нього виник.
  resultingPurchaseOrder PurchaseOrder? @relation("BidWinningPO")
  awardedAt           DateTime?
  awardedById         String?
  awardedBy           User?        @relation("BidAwarder", fields: [awardedById], references: [id])
  /// IP постачальника на момент сабміту (audit).
  submittedFromIp     String?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  @@unique([rfqId, counterpartyId])
  @@index([status])
  @@map("bids")
}

model BidItem {
  id                              String  @id @default(cuid())
  bidId                           String
  bid                             Bid     @relation(fields: [bidId], references: [id], onDelete: Cascade)
  purchaseRequestItemId           String
  purchaseRequestItem             PurchaseRequestItem @relation(fields: [purchaseRequestItemId], references: [id], onDelete: Cascade)
  unitPrice                       Decimal @db.Decimal(12, 2)
  deliveryDate                    DateTime?
  /// Постачальник може запропонувати альтернативу (напр. М300 замість М250).
  alternativeOfferDescription     String?
  alternativeOfferPrice           Decimal? @db.Decimal(12, 2)
  notes                           String?

  @@unique([bidId, purchaseRequestItemId])
  @@map("bid_items")
}

model PurchaseOrder {
  id                  String              @id @default(cuid())
  firmId              String
  firm                Firm                @relation(fields: [firmId], references: [id])
  projectId           String?
  project             Project?            @relation("ProjectPurchaseOrders", fields: [projectId], references: [id], onDelete: SetNull)
  winningBidId        String              @unique
  winningBid          Bid                 @relation("BidWinningPO", fields: [winningBidId], references: [id])
  counterpartyId      String
  counterparty        Counterparty        @relation("CounterpartyPurchaseOrders", fields: [counterpartyId], references: [id])
  totalAmount         Decimal             @db.Decimal(12, 2)
  currency            String              @default("UAH")
  status              PurchaseOrderStatus @default(DRAFT)
  /// "PO-2026-0001"
  internalNumber      String              @unique
  paymentTerms        String?
  issuedAt            DateTime?
  /// Очікувана дата доставки.
  deliveryDueAt       DateTime?
  actualDeliveredAt   DateTime?
  /// R2 URL до згенерованого PDF.
  pdfUrl              String?
  cancelledAt         DateTime?
  cancelReason        String?
  createdById         String
  createdBy           User                @relation("PurchaseOrderCreator", fields: [createdById], references: [id])
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@index([firmId, status])
  @@index([counterpartyId])
  @@index([projectId])
  @@map("purchase_orders")
}
```

Також додати back-relations у існуючі моделі:

```prisma
// model Counterparty {
//   ...
//   rfqRecipients  RFQRecipient[]    @relation("CounterpartyRFQRecipients")
//   bids           Bid[]             @relation("CounterpartyBids")
//   purchaseOrders PurchaseOrder[]   @relation("CounterpartyPurchaseOrders")
// }

// model Project {
//   ...
//   purchaseRequests PurchaseRequest[] @relation("ProjectPurchaseRequests")
//   purchaseOrders   PurchaseOrder[]   @relation("ProjectPurchaseOrders")
// }

// model FinanceEntrySource (enum)
//   + PURCHASE_ORDER

// model User { (back-relations)
//   purchaseRequestsRequested PurchaseRequest[] @relation("PurchaseRequestRequester")
//   rfqsClosed                RFQ[]             @relation("RFQCloser")
//   bidsAwarded               Bid[]             @relation("BidAwarder")
//   purchaseOrdersCreated     PurchaseOrder[]   @relation("PurchaseOrderCreator")
// }
```

## Migration Strategy

1. **Phase A (schema-only, без даних):** додати усі нові моделі + back-relations.
   ```bash
   npx prisma migrate dev --name procurement_phase_a_models
   ```
   ⚠️ Виконувати лише проти **локальної throwaway-БД** (інцидент 2026-05-22). Production котиться через `prisma migrate deploy`.

2. **Phase B (FK cost_code):** після того як Task 01 (Cost Codes) у main — окрема міграція `procurement_phase_b_costcode_fk` додає FK з `PurchaseRequestItem.costCodeId` на `cost_codes(id)` з `ON DELETE SET NULL`. До цього часу — лише String без FK (щоб не блокувати).

3. **Phase C (enum extend):** додати `PURCHASE_ORDER` у `FinanceEntrySource`. Не змінювати поведінку writers поки UI ще не показує lock на PO.

4. **Seed (опційно):** один тестовий `PurchaseRequest` у DRAFT з 3 items для перевірки UI на staging.

5. **No backfill** — модуль зелений, історичних даних немає.

## API Endpoints

### Admin (auth required)

| Verb   | Path                                                    | Body / Query                                        | Response                                  | RBAC                                |
| ------ | ------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| GET    | `/api/admin/purchase-requests`                          | `?firmId&projectId&status&page`                     | `PurchaseRequest[]` + counts              | MANAGER, ENGINEER, SUPER_ADMIN      |
| POST   | `/api/admin/purchase-requests`                          | `{ projectId?, neededBy, notes, items[] }`          | `PurchaseRequest`                         | MANAGER, ENGINEER, SUPER_ADMIN      |
| GET    | `/api/admin/purchase-requests/:id`                      | —                                                   | `PurchaseRequest` (з items, rfqs)         | scope-перевірка firmId              |
| PATCH  | `/api/admin/purchase-requests/:id`                      | partial fields                                      | `PurchaseRequest`                         | requester або MANAGER+              |
| DELETE | `/api/admin/purchase-requests/:id`                      | — (тільки якщо `status=DRAFT`)                      | 204                                       | requester або SUPER_ADMIN           |
| POST   | `/api/admin/purchase-requests/:id/send-rfq`             | `{ counterpartyIds: string[], deadline }`           | `RFQ`                                     | MANAGER, SUPER_ADMIN                |
| GET    | `/api/admin/rfqs/:id/bids`                              | —                                                   | `{ bids: Bid[], comparisonMatrix }`       | MANAGER, ENGINEER (без сум), SUPER  |
| POST   | `/api/admin/rfqs/:id/award`                             | `{ bidId, justification? }`                         | `PurchaseOrder`                           | MANAGER, SUPER_ADMIN                |
| POST   | `/api/admin/rfqs/:id/close`                             | — (manual close без award)                          | `RFQ`                                     | MANAGER, SUPER_ADMIN                |
| POST   | `/api/admin/rfqs/:id/remind`                            | `{ recipientIds?: string[] }`                       | `{ sent: number }`                        | MANAGER, SUPER_ADMIN                |
| GET    | `/api/admin/purchase-orders`                            | `?firmId&projectId&counterpartyId&status&page`      | `PurchaseOrder[]`                         | MANAGER+ENGINEER (без сум), SUPER   |
| GET    | `/api/admin/purchase-orders/:id`                        | —                                                   | `PurchaseOrder` (з items, bid)            | scope                               |
| POST   | `/api/admin/purchase-orders/:id/confirm-delivery`       | `{ deliveredAt, fullyDelivered: boolean, notes? }`  | `PurchaseOrder`                           | MANAGER, FOREMAN, SUPER_ADMIN       |
| POST   | `/api/admin/purchase-orders/:id/cancel`                 | `{ reason }`                                        | `PurchaseOrder`                           | MANAGER, SUPER_ADMIN                |
| GET    | `/api/admin/purchase-orders/:id/pdf`                    | —                                                   | `application/pdf` stream (R2 signed URL)  | scope                               |

### Public (NO auth, token-based)

| Verb | Path                            | Body                                            | Response                                  | Notes                                  |
| ---- | ------------------------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| GET  | `/api/public/rfq/:token`        | —                                               | `{ rfq, items, supplier, alreadyBid }`    | `:token` = `RFQRecipient.accessToken`; rate-limit (50 req/min/IP) |
| POST | `/api/public/rfq/:token/bid`    | `{ items: [...], paymentTerms, deliveryDays, validUntil, notes }` | `{ ok: true, bidId }` | Tx: upsert Bid + recalc totalPrice + mark recipient.bidSubmittedAt + email confirm |
| GET  | `/api/public/rfq/preview/:publicLinkToken` | —                                    | `{ rfq, items }` read-only без бід-форми  | для шарингу всередині команди постачальника |

### Handler signatures (приклади)

```ts
// src/app/api/admin/purchase-requests/[id]/send-rfq/route.ts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  const { firmId } = await resolveFirmScopeForRequest(session);
  await assertRole(session, ["MANAGER", "SUPER_ADMIN"]);
  const body = await req.json();
  const { counterpartyIds, deadline } = sendRfqSchema.parse(body);
  // tx: створити RFQ, RFQRecipient[], згенерувати токени, відправити emails
  // повертає RFQ
}

// src/app/api/public/rfq/[token]/bid/route.ts
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  // rate-limit by IP
  // знайти RFQRecipient by accessToken з RFQ + items
  // перевірити RFQ.status === COLLECTING || SENT, deadline > now
  // tx: upsert Bid + BidItem[] + перерахувати totalPrice + mark submittedAt + recipient.bidSubmittedAt
  // notify PM (in-app + email)
  return NextResponse.json({ ok: true, bidId });
}
```

## UI Changes

### Нові директорії

- `src/app/admin-v2/procurement/` — головна сторінка модуля з табами:
  - `page.tsx` — overview + 4 таби: "Запити", "RFQ", "Біди", "Замовлення"
  - `requests/page.tsx` — список `PurchaseRequest` (фільтри: проєкт, статус, requester, дата)
  - `requests/new/page.tsx` — форма створення (items з autocomplete cost-code)
  - `requests/[id]/page.tsx` — деталі + кнопка "Розіслати RFQ" (модалка з вибором постачальників)
  - `rfqs/page.tsx` — список з прогрес-бар "X з Y відповіли"
  - `rfqs/[id]/page.tsx` — comparison matrix (див. нижче)
  - `purchase-orders/page.tsx` — список PO
  - `purchase-orders/[id]/page.tsx` — PO + кнопки "Підтвердити доставку", "Скачати PDF"

- `src/app/public/rfq/[token]/page.tsx` — UA-локалізована форма для постачальника:
  - Header з логотипом Metrum + назва запиту + deadline countdown
  - Таблиця items: опис, ДСТУ, кількість, одиниця → колонка "Ваша ціна за одиницю" + "Дата готовності" + "Альтернатива?"
  - Footer: загальні умови оплати, термін доставки, validUntil
  - Submit → success page з підтвердженням
  - При повторному відвідуванні з тим же токеном — показує submitted bid (read-only) + кнопка "Оновити" якщо deadline ще не настав

### Compomonents

- `src/components/procurement/`
  - `RfqRecipientPicker.tsx` — мульти-селект `Counterparty` з фільтром `isSupplier=true`, групування за `categoryTags`, показ rating
  - `BidComparisonMatrix.tsx` — таблиця-матриця:
    - рядки: PurchaseRequestItem
    - колонки: Bid (по постачальниках)
    - клітинки: `unitPrice × qty` з кольоровою індикацією (зелений — мінімум по рядку, червоний — макс)
    - footer: totalPrice, deliveryDays, paymentTerms, score (формула нижче)
    - **RBAC:** для не-SUPER_ADMIN сум не видно (placeholder "—"), порівняння йде лише за днями доставки і рейтингом
  - `BidScoreBadge.tsx` — composite score: `score = 0.6 * priceRank + 0.2 * deliveryRank + 0.2 * counterparty.rating`. Тіки на тултіпі: "75 балів: ціна 9/10, доставка 6/10, рейтинг 7/10"
  - `AwardConfirmModal.tsx` — підтвердження award з обов'язковим полем `justification` (audit trail)
  - `PurchaseOrderPdfPreview.tsx` — попередній перегляд PDF перед issue

### Nav

- `src/app/admin-v2/_lib/nav.ts` — додати:
  ```ts
  { href: "/admin-v2/procurement", label: "Закупки", icon: ShoppingCart, roles: ["MANAGER","ENGINEER","SUPER_ADMIN","FINANCIER"] }
  ```

### Email templates (`src/lib/email/templates/procurement/`)

- `rfqInvitation.tsx` — лист постачальнику з лінком (`https://<domain>/public/rfq/<token>`)
- `bidReceivedConfirm.tsx` — постачальнику "ваш бід отримано"
- `bidReminder.tsx` — нагадування за 24 год до deadline
- `awardWinner.tsx` — переможцю
- `awardLoser.tsx` — програвшим (тон ввічливий, без сум переможця)
- `poIssuedToSupplier.tsx` — постачальнику з прикріпленим PDF

## Implementation Plan

1. Створити гілку `feat/procurement-rfq`. Перевірити, що `main` зачейн-пуленений, `npm run typecheck` зелений.
2. **Phase A migration:** додати Prisma моделі + enum-и + back-relations у локальній БД, `npx prisma migrate dev --name procurement_phase_a_models`. Закомітити міграцію.
3. Згенерувати `prisma generate`. Додати zod-схеми у `src/lib/procurement/schemas.ts` (createPurchaseRequest, sendRfq, submitBid, award).
4. Внутрішнє нумерування: створити `src/lib/procurement/numbering.ts` — atomic counter для `PR-2026-NNNN`, `RFQ-2026-NNNN`, `PO-2026-NNNN` (через окрему `Sequence` table або `nextval`-pattern; обов'язково unique constraint як safety net).
5. Реалізувати `src/lib/procurement/tokens.ts` — `generateAccessToken()` через `crypto.randomBytes(32).toString('base64url')` (32 байти → 256 біт ентропії, no enumeration).
6. Реалізувати CRUD endpoints для `PurchaseRequest` + `PurchaseRequestItem` з `resolveFirmScopeForRequest` на кожному handler.
7. Реалізувати `send-rfq`: транзакція створює RFQ (status=SENT), RFQRecipient[]-и з токенами, шле email batch. На фейл одного email — лог у `EmailDeliveryLog` (новий міні-table або use existing), але транзакція не rollback (best-effort delivery).
8. Реалізувати **public** endpoints (`/api/public/rfq/:token/*`) — окремий middleware без auth, з IP rate-limit (`@upstash/ratelimit` або in-memory LRU). Logging всіх запитів у audit.
9. Реалізувати `submitBid`: транзакція upsert Bid + BidItem[] + recalc totalPrice (sum(unitPrice × qty)) + mark recipient.bidSubmittedAt + notification.
10. Реалізувати `award`: транзакція `prisma.$transaction([...])` — set одного bid.status=WON, всі інші bids цього RFQ → LOST, create PurchaseOrder з copy полів, rfq.status=CLOSED, purchaseRequest.status=PO_ISSUED, send emails winner+losers. **Атомарність обов'язкова** — інакше можна award двічі.
11. PDF-генератор для PO: `src/lib/procurement/pdf.ts` через `@react-pdf/renderer` (вже є у проєкті для актів?). Шаблон — шапка з реквізитами `Firm`, таблиця items, footer з реквізитами `Counterparty`, підписи (заглушка для майбутнього e-sign). Зберігати у R2 `documents/po/<id>.pdf`, посилання у `PurchaseOrder.pdfUrl`.
12. UI: `admin-v2/procurement/requests/new` — форма з cost-code autocomplete (reuse `<CostCodeSelect>` з Task 01), додавання items inline.
13. UI: `admin-v2/procurement/rfqs/[id]` — `BidComparisonMatrix` з sticky-headers, RBAC-вирізаними сумами.
14. UI: public `/public/rfq/[token]` — простий Tailwind layout, без admin chrome, без auth-redirect. Локалізація UA. Перевірити mobile (постачальники часто з телефона).
15. Email templates через `@react-email/components` (reuse pattern). Тестова відправка через MailHog/devmail.
16. Cron / background job: `src/lib/cron/rfq-reminders.ts` — кожні 6 год шукає `RFQ.status=SENT/COLLECTING` з deadline через 24/12/2 год і шле reminder тим recipient, у кого `bidSubmittedAt IS NULL`. Закриває expired RFQ (status → CLOSED).
17. Audit: `AuditLog` (якщо є) пишемо подіями `PROCUREMENT_RFQ_SENT`, `PROCUREMENT_BID_SUBMITTED`, `PROCUREMENT_AWARDED`, `PROCUREMENT_PO_DELIVERED`. Якщо `AuditLog` ще немає — додати лише поля у відповідні моделі (`awardedById`, `closedById`, `createdById`).
18. Інтеграція з фінансами: при `PurchaseOrder.status=CONFIRMED` (постачальник підтвердив) — створити preview `FinanceEntry { kind: PLAN, source: PURCHASE_ORDER, amount: totalAmount, costCodeId: ..., counterpartyId: ..., approvedById: null }` (status=DRAFT). При `DELIVERED` — конвертувати у FACT. Це окрема функція `src/lib/procurement/finance-sync.ts`. **Не змінює** існуючу writer-логіку FinanceEntry — лише insert.
19. Nav + RBAC guard на page level (`assertRole`).
20. Тести (див. нижче). Commit + push + PR.

## Acceptance Criteria

1. PM може створити PurchaseRequest з ≥ 1 item з cost-code і розіслати RFQ ≥ 1 постачальнику за ≤ 2 хв (manual end-to-end).
2. Постачальник, відкривши лінк, бачить форму без логіну й може заповнити бід; повторний візит показує already-submitted bid у read-only режимі.
3. PM на сторінці порівняння бачить матрицю "позиція × постачальник" з підсвіченим мінімумом по кожному рядку і composite-score у footer.
4. Award одного біда: інші біди стають LOST **в одній транзакції**, створюється PurchaseOrder, генерується PDF, шлються email-и winner+losers. Подвійний clic на "Award" не створює два PO (transaction + unique constraint на `Bid.resultingPurchaseOrder`).
5. Студійний MANAGER (firmId="metrum-studio") **не бачить** запитів Group і навпаки (firm isolation тест).
6. ENGINEER бачить матрицю бідів **без цифр** (placeholders), MANAGER з не-SUPER_ADMIN ролі — теж без сум (RBAC strict як у MEMORY 2026-05-11).
7. Token security: знаючи 1 валідний `accessToken` не можна вгадати інший (повна ентропія 256 біт; `len(token) >= 32`).
8. RFQ з deadline < now повертає 410 GONE при спробі сабмітнути бід; UI показує "Прийом завершено".
9. Public endpoint витримує 100 req/sec без 5xx (rate-limit ріже спам, не лежить).
10. PDF PO відкривається у Chrome/Acrobat, містить усі items, totalAmount, реквізити firm + counterparty.

## Testing

### Unit (`src/lib/procurement/__tests__/`)
- `numbering.test.ts` — конкурентні `nextNumber()` дають unique значення (1000 calls in parallel).
- `tokens.test.ts` — `generateAccessToken()` має ≥ 32 байти ентропії, не повторюється у 100k викликах.
- `pricing.test.ts` — `calcBidTotalPrice(items)` коректно для пустого, для з NaN/null, для альтернативи.
- `score.test.ts` — composite score формула.
- `finance-sync.test.ts` — PURCHASE_ORDER → FinanceEntry створюється з правильними полями, без дубля при ре-confirm.

### Integration (`src/app/api/**/__tests__/`)
- `send-rfq.test.ts` — RFQ створено + N recipients + N токенів унікальні + email-стаб викликано N разів.
- `submit-bid.test.ts` — happy path, повторний submit (upsert), submit після deadline (410), submit з невалідним token (404).
- `award.test.ts` — атомарність: симуляція "concurrent award" → один success, інший fails з conflict; одиничний PO створюється.
- `public-rfq-rate-limit.test.ts` — 60 req/min проходять, 61-й 429.
- `firm-isolation.test.ts` — Studio user не бачить Group PR через `/api/admin/purchase-requests`.

### Components (Jest + RTL)
- `BidComparisonMatrix.test.tsx` — рендер з 3 bids × 5 items, highlight мінімуму, RBAC-приховування сум при `canViewFinance=false`.
- `AwardConfirmModal.test.tsx` — submit disabled поки `justification` < 10 символів.

### Manual / E2E
- Smoke: створити PR (з 3 items) → SEND RFQ (2 counterparty) → відкрити обидва public links у incognito → сабмітнути обидва біди → award переможця → перевірити PDF → перевірити inbox листів усіх 4-х адрес.
- Mobile (iPhone Safari): public RFQ form грається, тач-кліки коректні, форма не злітає при keyboard open.
- Lighthouse: public RFQ page ≥ 90 performance.

## Open Questions

1. **Електронний підпис PO** — потрібно одразу Дія-підпис (див. Task 11) чи поки тільки PDF з handwritten? **Припускаю: тільки PDF, e-sign — після Task 11.**
2. **Конвертація валют** — біди в USD/EUR для імпортного обладнання дозволено? **Припускаю: так, поле `currency` на Bid/PO, конверсія в UAH тільки для дисплею (НЕ зберігати в FinanceEntry в UAH автоматично — це окремий exchange-task).**
3. **Multiple awards** — чи можна award різні items до різних bids (split award)? **Припускаю: ні, MVP — winner-takes-all для всього RFQ. Split award — окремий task.**
4. **Cron infrastructure** — як ми зараз запускаємо background jobs у Metrum? Vercel Cron, Railway scheduled, self-hosted node? **Уточнити у користувача.**
5. **Telegram-нотифікація PM** при отриманні біда — використовувати існуючий bot (з MEMORY)? **Припускаю: так, через `notifyUsers(['<pmId>'], { kind: 'BID_RECEIVED' })`.**
6. **Дозволити постачальнику завантажувати файл (комерційна пропозиція PDF)** — додати `BidAttachment` модель? **Припускаю: MVP — лише `notes` text, attachments — окремий task.**
7. **Що робити з історичними прайс-листами** з Counterparty 360 (Task 09 у README) — pre-fill полей? **Можна окремою фічею пізніше.**

## References

- **Файли проєкту:**
  - `prisma/schema.prisma` (Counterparty: ~3268, FinanceEntry: ~573, Project: ~122)
  - `src/lib/firm/scope.ts`, `src/lib/firm/server-scope.ts`
  - `src/lib/auth.ts` (RBAC patterns)
  - `src/lib/financing/` (як FinanceEntry створюється з approve-flow — приклад для PO→FinanceEntry sync)
  - `src/app/api/foreman/reports/route.ts` (приклад transaction approve-flow)
- **Залежні task-и:** `01-cost-codes-wbs.md`, `08-*` (SRM/Subcontractor)
- **MEMORY:** `project_metrum_finance_access_rule.md` (RBAC фінансів strict), `project_metrum_full_firm_isolation.md` (firm isolation), `project_metrum_migrations_workflow.md` (DB safety)
- **External:**
  - [ISO 19650 — Procurement BIM workflow](https://www.iso.org/standard/68078.html) — натхнення для item-specifications JSON
  - [@react-pdf/renderer docs](https://react-pdf.org/) — генерація PDF PO
  - [Upstash Ratelimit](https://github.com/upstash/ratelimit) — public endpoint rate-limiting
  - ДСТУ Б В.2.7-46:2010 — формат опису бетонних сумішей (приклад для specifications JSON)
