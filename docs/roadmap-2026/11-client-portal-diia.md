# Task 11 — Client Portal v2 + Дія.Підпис інтеграція

> Priority: 🟡 HIGH | Estimate: 4–6 тижнів | Owner: ___

## Mission

Розширити існуючий клієнтський портал (`src/app/dashboard/*`) до повноцінного "self-service кабінету замовника": огляд прогресу проєкту з фото/Gantt, документи на підпис (ChangeOrder, акти КБ-2в/КБ-3, договори), статус оплат, обмежений 1-to-1 месенджер з PM. Найважливіша частина — інтеграція **Дія.Підпис** (КЕП через мобільний застосунок Дія) для юридично значущого електронного підпису без паперу. Альтернатива MVP — "simple e-sign" (checkbox + IP/timestamp + email-OTP) як fallback, поки немає партнерського договору з Мінцифрою.

## Context

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini, Jest.
**Канонічна client UI:** `src/app/dashboard/*` (НЕ admin-v2 — це окрема зона). Існуючі підпапки: `projects/`, `finance/`, `notifications/`, `profile/`, `visualizer/`. `page-old.tsx` — legacy, ігнорувати.
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Клієнт бачить тільки проєкти, де він `Project.clientId` (вже працює у `dashboard/page.tsx`). Перевірка через `resolveFirmScopeForRequest` + явний `clientId = session.user.id` filter.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Клієнт-портал — лише `CLIENT` role (+ SUPER_ADMIN з режимом impersonate для дебагу).
**Foreman flow** не торкаємо.
**Тести:** `src/lib/**/__tests__/*.test.ts` + `npm run test:unit`.

## Business Goal

- Зменшити кількість дзвінків PM від клієнтів типу "як там справи?" на ≥ 50% (клієнт сам бачить фото, % виконання, графік).
- Скоротити цикл підпису додаткових угод з 5–10 днів (друк / поштa / зустріч) до ≤ 1 дня (Дія).
- Юридично-значущий e-sign КЕП через Дія = visa-stamped audit-trail, який легше захищати в суді ніж "signed by checkbox".
- Метрика: 80% активних клієнтів логіняться у портал хоча б раз/тиждень; ≥ 70% дод. угод підписуються електронно (Дія або simple); час "issued → signed" ≤ 48 год для 90% документів.

## Out of Scope

- Multi-language (тільки UA — клієнти всі українськомовні).
- Push-нотифікації браузерні (тільки email + SMS у MVP; web-push — окремо).
- Платежі онлайн (LiqPay/WayForPay) — тільки заглушка-кнопка "Оплатити", linked до payment-link якщо є; інтеграція — окремий task.
- Імпорт КЕП-ключа на сервер (зайве для Дія-flow, де підпис відбувається на смартфоні клієнта).
- Підпис документів самим Metrum-ом через Дію (тільки клієнт; підпис компанії — paper / печатка PM-а окремо).
- Юридичні документи / generation актів — це Task 07 (Document Builder). Тут — лише UI відображення + підпис.

## Prerequisites

- [ ] **Прочитати поточний стан `src/app/dashboard/*`** (зроблено у preflight):
  - `page.tsx` — overview з CompactStatsCard, projects list, nextPayment
  - `projects/page.tsx` — список проєктів клієнта
  - `projects/[id]/page.tsx` — деталі (треба прочитати)
  - `finance/page.tsx` — фінанси проєкту (вже firm-scoped через `firmWhereForProject`)
  - `notifications/`, `profile/`, `visualizer/` — є
- [ ] Task 02 (Change Orders) — модель `ChangeOrder` має поле `status` з варіантом `PENDING_CLIENT` → саме його ми signing flow покриває.
- [ ] Task 03 (Site Forms / Document Builder, він же 07 у README) — генеруються PDF актів КБ-2в/КБ-3, які доступні через `/api/admin/documents/:id/file`.
- [ ] Email + SMS провайдер. Перевірити `src/lib/email/`, `src/lib/sms/`. Якщо SMS немає — додати (Vonage/Twilio/TurboSMS).
- [ ] Партнерська угода з Мінцифрою для production Дія.Підпис. **Поки немає — стартуємо з MVP-simple e-sign + готуємо адаптер для Дія, який включається flag-ом.** Додати в Open Questions.

## 🚨 Parallel Conflicts

| Файл / артефакт                                | З ким серіалізуватись                  |
| ---------------------------------------------- | -------------------------------------- |
| `prisma/schema.prisma`                         | **усі task-и**                         |
| `ChangeOrder` model (Task 02)                  | 02 — додати back-relation `signatureRequest` (1-1) |
| `Project` model (back-relations signatureRequests) | 02, 05, 07, 09 — лише relation       |
| `next.config.ts` (whitelist `id.diia.gov.ua` redirect; CSP) | 03 (PWA SW), 06 (subdomain) |
| `src/lib/email/templates/`                     | 09 (procurement) — окремі шаблони      |
| `src/middleware.ts` (route `/dashboard/[clientToken]` без auth) | усі тасок, що чіпають middleware |
| Existing `src/app/dashboard/*`                 | мало хто, низький ризик                |

## Data Model (Prisma)

```prisma
enum SignatureDocumentType {
  CHANGE_ORDER
  ACT_KB2V         // акт виконаних робіт КБ-2в
  ACT_KB3          // довідка про вартість виконаних робіт КБ-3
  CONTRACT
  ANNEX            // додаток
  OTHER
}

enum SignatureMethod {
  DIIA             // Дія.Підпис через мобільний застосунок
  SIMPLE           // Спрощений: checkbox + IP + timestamp + email-OTP
}

enum SignatureStatus {
  PENDING
  SIGNING          // користувач у процесі (відкрив Дію або ввів OTP)
  SIGNED
  REJECTED
  EXPIRED
  CANCELLED
}

model SignatureRequest {
  id                String                @id @default(cuid())
  firmId            String
  firm              Firm                  @relation(fields: [firmId], references: [id])
  projectId         String?
  project           Project?              @relation("ProjectSignatureRequests", fields: [projectId], references: [id], onDelete: SetNull)

  documentType      SignatureDocumentType
  /// FK на джерельну сутність залежно від documentType (CHANGE_ORDER → ChangeOrder.id, etc.).
  /// String щоб уникнути polymorphic FK; целостность перевіряємо у service-layer.
  entityId          String
  /// Snapshot URL документа (R2) на момент створення запиту. Якщо документ оновили
  /// після — підпис буде на старій версії, але це ОК (це і є фіксація моменту).
  documentSnapshotUrl String

  signerUserId      String
  signerUser        User                  @relation("SignatureRequestSigner", fields: [signerUserId], references: [id])
  /// Email snapshot (бо user.email може змінитись).
  signerEmailSnapshot String
  /// Phone snapshot для SMS-OTP / Дія-callback.
  signerPhoneSnapshot String?

  method            SignatureMethod
  status            SignatureStatus       @default(PENDING)

  /// URL підписаного PDF (з вшитим QES або з footer-метаданими для SIMPLE).
  signedDocumentUrl String?
  signedAt          DateTime?

  /// Дія: session_id повернутий Дія API при ініціації.
  externalSessionId String?               @unique
  /// Дія: повний response від callback (для audit).
  externalPayload   Json?

  /// SIMPLE: одноразовий OTP-код, відправлений email/SMS. Hashed (bcrypt).
  otpHash           String?
  otpAttempts       Int                   @default(0)

  expiresAt         DateTime
  rejectedReason    String?
  /// IP клієнта на момент підпису (audit для SIMPLE).
  signedFromIp      String?
  /// User-Agent на момент підпису.
  signedFromUa      String?

  createdById       String
  createdBy         User                  @relation("SignatureRequestCreator", fields: [createdById], references: [id])
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  auditEvents       SignatureAuditEvent[] @relation("SignatureRequestEvents")

  @@index([firmId, status])
  @@index([signerUserId, status])
  @@index([entityId, documentType])
  @@map("signature_requests")
}

model SignatureAuditEvent {
  id                String           @id @default(cuid())
  requestId         String
  request           SignatureRequest @relation("SignatureRequestEvents", fields: [requestId], references: [id], onDelete: Cascade)
  /// "CREATED" | "VIEWED" | "OTP_SENT" | "OTP_VERIFIED" | "DIIA_REDIRECT" | "DIIA_CALLBACK" | "SIGNED" | "REJECTED" | "EXPIRED"
  eventType         String
  /// IP запиту.
  ip                String?
  userAgent         String?
  /// Будь-яка деталь (callback payload, помилка тощо).
  details           Json?
  occurredAt        DateTime         @default(now())

  @@index([requestId, occurredAt])
  @@map("signature_audit_events")
}

/// Token-based public access для клієнтів, які ще не зареєстровані повноцінно
/// (запрошення на проєкт по лінку без password). При першому використанні
/// можна привʼязати до існуючого CLIENT-user або створити нового.
model ClientPortalInvitation {
  id            String   @id @default(cuid())
  firmId        String
  firm          Firm     @relation(fields: [firmId], references: [id])
  projectId     String
  project       Project  @relation("ProjectClientInvitations", fields: [projectId], references: [id], onDelete: Cascade)
  email         String
  phone         String?
  /// Cryptographic random 32 байти base64url. Унікальний.
  token         String   @unique
  /// JWT signed для додаткової безпеки — payload {invitationId, exp}. Verified on each request.
  signedToken   String
  expiresAt     DateTime
  acceptedAt    DateTime?
  acceptedUserId String?
  acceptedUser  User?    @relation("ClientPortalInvitationAcceptor", fields: [acceptedUserId], references: [id])
  createdById   String
  createdBy     User     @relation("ClientPortalInvitationCreator", fields: [createdById], references: [id])
  createdAt     DateTime @default(now())

  @@index([projectId])
  @@index([email])
  @@map("client_portal_invitations")
}

/// 1-to-1 PM ↔ Client chat. Окремий ModelClient/PM щоб НЕ міксувати з internal chat
/// (де клієнт міг би побачити внутрішні повідомлення).
model ClientChatMessage {
  id          String   @id @default(cuid())
  firmId      String
  firm        Firm     @relation(fields: [firmId], references: [id])
  projectId   String
  project     Project  @relation("ProjectClientChat", fields: [projectId], references: [id], onDelete: Cascade)
  /// Або client, або PM. Не може бути нікого іншого.
  senderUserId String
  senderUser   User    @relation("ClientChatSender", fields: [senderUserId], references: [id])
  text        String
  attachmentUrl String?
  readByOther Boolean  @default(false)
  readAt      DateTime?
  createdAt   DateTime @default(now())

  @@index([projectId, createdAt])
  @@map("client_chat_messages")
}
```

Розширення існуючих моделей:

```prisma
// model ChangeOrder { (Task 02)
//   ...
//   signatureRequest SignatureRequest? @relation(...) // optional, бо не всі CO потребують підпис
// }
//
// (FK сидить у SignatureRequest.entityId логічно, не в ChangeOrder)

// model Project {
//   ...
//   signatureRequests  SignatureRequest[]       @relation("ProjectSignatureRequests")
//   clientInvitations  ClientPortalInvitation[] @relation("ProjectClientInvitations")
//   clientChatMessages ClientChatMessage[]      @relation("ProjectClientChat")
// }

// model User {
//   ...
//   signatureRequestsAsSigner    SignatureRequest[]       @relation("SignatureRequestSigner")
//   signatureRequestsCreated     SignatureRequest[]       @relation("SignatureRequestCreator")
//   clientInvitationsAccepted    ClientPortalInvitation[] @relation("ClientPortalInvitationAcceptor")
//   clientInvitationsCreated     ClientPortalInvitation[] @relation("ClientPortalInvitationCreator")
//   clientChatMessagesSent       ClientChatMessage[]      @relation("ClientChatSender")
// }
```

## Migration Strategy

1. **Phase A:** Prisma моделі + enum-и + back-relations.
   ```bash
   npx prisma migrate dev --name client_portal_v2_phase_a
   ```
   ⚠️ Лише на локальній throwaway. Production — `prisma migrate deploy`.

2. **Phase B (feature-flag):** `process.env.DIIA_ENABLED === "true"` контролює видимість Дія-кнопки. У production стартуємо з `false` → весь signing flow через SIMPLE; вмикаємо коли партнерська угода готова.

3. **Phase C — Дія.Підпис adapter:** при готовності угоди:
   - Заповнюємо `DIIA_CLIENT_ID`, `DIIA_CLIENT_SECRET`, `DIIA_CALLBACK_URL` у env.
   - Прогон smoke-тесту на sandbox-середовищі Дії (sandbox endpoint у документації).
   - Перемикаємо flag → користувачі бачать обидві кнопки.

4. **No backfill** — модуль зелений. Існуючі дод. угоди / акти можна вручну re-submit на підпис через UI.

## API Endpoints

### Client portal (auth required, role=CLIENT, scope: лише свої projects)

| Verb | Path                                                  | Body / Query                 | Response                              |
| ---- | ----------------------------------------------------- | ---------------------------- | ------------------------------------- |
| GET  | `/api/client/projects/:id/overview`                   | —                            | `{ progressPct, photos[], ganttSummary, nextMilestone }` |
| GET  | `/api/client/projects/:id/photos`                     | `?page&perPage`              | `{ photos: [...] }` (з PhotoReport)   |
| GET  | `/api/client/signature-requests`                      | `?status&projectId`          | `SignatureRequest[]` (тільки де signerUserId = self) |
| GET  | `/api/client/signature-requests/:id`                  | —                            | `SignatureRequest` (з audit events)   |
| POST | `/api/client/signature-requests/:id/start-simple`     | —                            | `{ otpSent: true, expiresIn: 600 }`   |
| POST | `/api/client/signature-requests/:id/verify-simple`    | `{ otp }`                    | `{ signed: true, signedDocumentUrl }` |
| POST | `/api/client/signature-requests/:id/start-diia`       | —                            | `{ redirectUrl }` (на id.diia.gov.ua) |
| POST | `/api/client/signature-requests/:id/reject`           | `{ reason }`                 | `SignatureRequest`                    |
| GET  | `/api/client/projects/:id/chat`                       | `?after`                     | `ClientChatMessage[]`                 |
| POST | `/api/client/projects/:id/chat`                       | `{ text, attachmentUrl? }`   | `ClientChatMessage`                   |
| POST | `/api/client/projects/:id/chat/mark-read`             | `{ upTo: messageId }`        | `{ marked: number }`                  |

### Public (NO auth, token-based — для invitation flow)

| Verb | Path                                          | Body                          | Response                                       |
| ---- | --------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| GET  | `/api/public/client-invitation/:token`        | —                             | `{ invitation, project: {name, address} }`    |
| POST | `/api/public/client-invitation/:token/accept` | `{ name, password }`          | `{ userId, session }` (auto-login)            |

### Admin (для PM створити signature request і invitation)

| Verb | Path                                                  | Body                                       | Response                |
| ---- | ----------------------------------------------------- | ------------------------------------------ | ----------------------- |
| POST | `/api/admin/signature-requests`                       | `{ documentType, entityId, signerUserId, method, expiresInDays }` | `SignatureRequest` |
| POST | `/api/admin/signature-requests/:id/cancel`            | `{ reason }`                               | `SignatureRequest`      |
| POST | `/api/admin/client-invitations`                       | `{ projectId, email, phone?, expiresInDays }` | `{ invitation, link }` |
| GET  | `/api/admin/client-invitations`                       | `?projectId`                               | `ClientPortalInvitation[]` |

### Дія webhook (public, signature-verified)

| Verb | Path                              | Headers                                  | Response             |
| ---- | --------------------------------- | ---------------------------------------- | -------------------- |
| POST | `/api/webhooks/diia/signature`    | `X-Diia-Signature` (HMAC SHA256 verify)  | 200 / 4xx            |

### Handler signatures (приклади)

```ts
// src/app/api/client/signature-requests/[id]/start-diia/route.ts
export async function POST(req, { params }) {
  const session = await auth();
  await assertRole(session, ["CLIENT"]);
  const sigReq = await prisma.signatureRequest.findUnique({ where: { id: params.id }});
  if (sigReq.signerUserId !== session.user.id) return forbidden();
  if (sigReq.status !== "PENDING") return conflict("ALREADY_PROCESSED");

  const { redirectUrl, sessionId } = await diiaService.initiateSignature({
    documentUrl: sigReq.documentSnapshotUrl,
    signerName: session.user.name,
    callbackUrl: `${process.env.APP_URL}/api/webhooks/diia/signature`,
  });

  await prisma.$transaction([
    prisma.signatureRequest.update({ where:{id:params.id}, data: { status: "SIGNING", externalSessionId: sessionId }}),
    prisma.signatureAuditEvent.create({ data: { requestId: params.id, eventType: "DIIA_REDIRECT", ip: getIp(req), details: { sessionId }}}),
  ]);
  return NextResponse.json({ redirectUrl });
}

// src/app/api/webhooks/diia/signature/route.ts
export async function POST(req) {
  const raw = await req.text();
  const sig = req.headers.get("x-diia-signature");
  if (!verifyDiiaSignature(raw, sig)) return new Response("invalid sig", { status: 401 });
  const payload = JSON.parse(raw);
  const sigReq = await prisma.signatureRequest.findUnique({ where: { externalSessionId: payload.sessionId }});
  if (!sigReq) return new Response("not found", { status: 404 });

  const signedPdfBuffer = await diiaService.downloadSignedDocument(payload.documentId);
  const r2Url = await uploadToR2(`signatures/${sigReq.id}.pdf`, signedPdfBuffer);
  await prisma.$transaction([
    prisma.signatureRequest.update({ where: { id: sigReq.id }, data: {
      status: "SIGNED", signedAt: new Date(), signedDocumentUrl: r2Url, externalPayload: payload,
    }}),
    prisma.signatureAuditEvent.create({ data: { requestId: sigReq.id, eventType: "DIIA_CALLBACK", details: payload }}),
  ]);
  // hook: оновити ChangeOrder.status = APPROVED, нотифікації
  await onDocumentSigned(sigReq);
  return new Response("ok");
}
```

## UI Changes

### Existing pages — extend

- `src/app/dashboard/page.tsx` — додати:
  - Картку "Документи на підпис: N" (із `/api/client/signature-requests?status=PENDING`)
  - Картку "Непрочитані з PM: N"
- `src/app/dashboard/projects/[id]/page.tsx` — нові tab-и:
  - "Огляд" (progressPct, фото-галерея, наступна milestone)
  - "Документи" (список SignatureRequest по цьому projectId)
  - "Чат з PM"
  - "Фінанси" (вже є, лишити)
- `src/app/dashboard/finance/page.tsx` — додати кнопку "Оплатити" (заглушка → mailto: або просто disabled "Скоро")

### New pages

- `src/app/dashboard/documents/page.tsx` — список усіх документів на підпис, фільтр по статусу
- `src/app/dashboard/documents/[id]/page.tsx` — деталь:
  - PDF preview (через react-pdf / iframe з R2 signed URL)
  - 2 кнопки: "Підписати через Дію" (якщо `DIIA_ENABLED`), "Підписати спрощено"
  - Кнопка "Відхилити" з модалкою reason
  - Audit-log внизу (creator, viewed, signed events)
- `src/app/dashboard/projects/[id]/chat/page.tsx` — чат UI (Tailwind, без websocket в MVP — polling кожні 10 сек)
- `src/app/(public)/dashboard/[clientToken]/page.tsx` — лендінг запрошення:
  - Картка з назвою проєкту + ім'я компанії
  - Форма "Прийняти запрошення": введіть ім'я + пароль → POST accept → авто-логін → redirect `/dashboard`

### Admin pages (для PM)

- `src/app/admin-v2/projects/[id]/_components/SignatureRequestModal.tsx` — модалка "Відправити на підпис":
  - Вибір документу (CO/Акт КБ-2/КБ-3/Договір — autocomplete з існуючих)
  - Вибір signer (з User WHERE clientId; або інший контрагент)
  - Метод (DIIA/SIMPLE)
  - expiresInDays (default 7)
- `src/app/admin-v2/projects/[id]/_components/ClientInvitationButton.tsx` — кнопка "Запросити клієнта", показує згенерований лінк, copy-to-clipboard

### Components

- `src/components/client-portal/`
  - `DocumentSignaturePanel.tsx` — PDF preview + sign buttons + status
  - `OtpInputModal.tsx` — 6-digit input, auto-focus, paste-friendly
  - `DiiaRedirectButton.tsx` — primary button з Дія-лого
  - `ChatThread.tsx` — message-bubbles, привʼязка polling
  - `ProjectProgressOverview.tsx` — donut з % виконання + last 3 photos + next milestone
  - `SignatureAuditLogTable.tsx` — для дебагу всіх audit events

### Email / SMS templates

- `src/lib/email/templates/client-portal/`
  - `documentForSignature.tsx` — "Вас просять підписати: ..."
  - `documentSigned.tsx` — підтвердження клієнту
  - `clientInvitation.tsx` — лист-запрошення в портал
  - `otpCode.tsx` — простий "Ваш код: 123456"
  - `chatNewMessage.tsx` — "PM написав вам у проєкті ..."
- SMS (через `src/lib/sms/`):
  - OTP-код
  - "Документ підписано"

### Middleware

- `src/middleware.ts` — додати whitelist для `/dashboard/[clientToken]` (regex) і `/api/public/client-invitation/*` (без auth).
- `next.config.ts` — `headers` додати CSP `frame-ancestors` для PDF preview iframe; redirect-host whitelist для `id.diia.gov.ua` (next/redirect не дозволить open-redirect).

## Implementation Plan

1. Створити гілку `feat/client-portal-v2`. `git pull main`, `npm run typecheck` зелений.
2. **Phase A migration:** Prisma моделі + back-relations. `npx prisma migrate dev --name client_portal_v2_phase_a`. Commit.
3. `npx prisma generate`. Zod schemas у `src/lib/client-portal/schemas.ts`.
4. Service-layer:
   - `src/lib/integrations/diia-signature.ts` — інтерфейс `DiiaService` з методами `initiateSignature`, `downloadSignedDocument`, `verifyDiiaSignature`. Імплементація `DiiaServiceImpl` (стук у https://api.diia.gov.ua) + `DiiaServiceMock` (для тестів і доки flag off — повертає mock-redirect, кліки автоматично "підписує" через 5 сек).
   - `src/lib/integrations/simple-signature.ts` — OTP gen (6 цифр, crypto-random), bcrypt-hash, verify, max 5 attempts → INVALIDATE.
   - `src/lib/client-portal/sign-orchestrator.ts` — wrapper, який обирає DIIA vs SIMPLE на основі method поля. Hook `onDocumentSigned(sigReq)` — оновлює відповідну entity (ChangeOrder.status=APPROVED, тощо), шле email, нотифікує PM.
5. CRUD endpoints для `SignatureRequest` (admin POST, client GET/POST verify/reject). Усі з firm-scope + RBAC.
6. Public endpoint `/api/public/client-invitation/:token` — accept, atomic: create-or-link User з role=CLIENT, set Project.clientId, mark invitation.acceptedAt, видати session.
7. Дія webhook `/api/webhooks/diia/signature` з HMAC verification. ⚠️ Open-redirect prevention: при start-diia повертаємо `redirectUrl`, який УЖЕ перевірений на host=id.diia.gov.ua.
8. Існуючі `/dashboard/*` extension:
   - `dashboard/page.tsx` — fetch signature-requests count + chat unread count, додати картки.
   - `dashboard/projects/[id]/page.tsx` — tabs з 4 секціями.
   - `dashboard/finance/page.tsx` — кнопка "Оплатити".
9. Нові client pages:
   - `dashboard/documents/[page,id]` — list + detail з PDF preview через `<iframe src="/api/r2/signed-url?key=...">` (signed URL з expiry 5 хв).
   - `dashboard/projects/[id]/chat/page.tsx` — polling-based чат (SWR з refreshInterval=10s).
10. Public invitation page `/dashboard/[clientToken]/page.tsx` — лендінг з формою accept.
11. Admin UI у `admin-v2/projects/[id]/`:
    - Кнопка "Запросити клієнта" (генерує link, copy)
    - Кнопка "Відправити на підпис" поряд з ChangeOrder / Document items
12. Email / SMS templates через `@react-email/components`. Test via MailHog + Twilio-sandbox.
13. SignatureAuditEvent — створюємо подію на КОЖНОМУ важливому кроці (CREATED, VIEWED — на GET detail, OTP_SENT, OTP_VERIFIED, DIIA_REDIRECT, DIIA_CALLBACK, SIGNED, REJECTED, EXPIRED).
14. Cron: `src/lib/cron/signature-expirations.ts` — щодоби expire-уємо PENDING/SIGNING з `expiresAt < now`, нотифікуємо обидві сторони. Idempotent.
15. Cron: `src/lib/cron/client-invitation-expirations.ts` — те ж саме для invitations.
16. **Security hardening:**
    - Rate-limit `/api/client/signature-requests/:id/verify-simple` — 5 спроб / 15 хв / IP+request.
    - Token entropy: `crypto.randomBytes(32).toString("base64url")` (256 біт).
    - JWT для signedToken з коротким exp і єдиним audience "client-portal".
    - CSP headers для embed PDF.
    - `next.config.ts` redirects: whitelist для `id.diia.gov.ua` (відмова від інших externalSessionId-derived hosts).
    - HttpOnly + Secure + SameSite=Lax для всіх cookies; CSRF token у формі accept.
17. Audit-log retention: не видаляти `SignatureAuditEvent` навіть якщо `SignatureRequest` cancel-нутий → keep forever для legal.
18. **Тести** (див. нижче).
19. Manual QA: повний flow — PM створює CO → invite client → client приймає → бачить документ → simple-sign → перевірити PDF з footer (IP, timestamp, email) у R2. Dia-flow — через mock.
20. PR, code-review, merge. Production: фічу пускаємо за feature-flag `CLIENT_PORTAL_V2_ENABLED=true` — спочатку для 2-3 тестових клієнтів.

## Acceptance Criteria

1. Існуючий клієнт після логіну на `/dashboard` бачить нові картки "Документи на підпис" і "Чат" з нунмерою.
2. У `dashboard/projects/[id]` — 4 tab-и: Огляд / Документи / Чат / Фінанси. Фінанси показують тільки **його** проєкти (firm-isolated, clientId-scoped).
3. Клієнт може ініціювати SIMPLE-підпис: отримує OTP на email + SMS → вводить → документ підписано → PDF згенеровано з footer-метаданими (signer name, IP, timestamp, email, "Підписано спрощеним методом").
4. При `DIIA_ENABLED=true` клієнт бачить кнопку "Підписати через Дію" → redirect на `id.diia.gov.ua` (whitelist-check проходить) → після callback документ у статусі SIGNED, у R2 лежить QES-PDF.
5. Підпис створює запис у `SignatureAuditEvent` (≥ 5 events для повного DIIA-flow, ≥ 4 для SIMPLE).
6. На спробу > 5 невалідних OTP підряд — request лочиться (status=REJECTED, attempts limit), користувач має написати PM-у. Rate-limit працює.
7. Експіровані requests (expiresAt<now) переходять у EXPIRED через cron, шлеться нотифікація.
8. ClientPortalInvitation token не можна вгадати (256 біт ентропії); accept створює User з role=CLIENT і прив'язує до Project.clientId.
9. Чат з PM: клієнт пише → PM бачить у admin-v2 у списку повідомлень з цього проєкту → відповідає → клієнт бачить через ≤ 10 сек polling. Інші CLIENT (не цього проєкту) не бачать.
10. CSRF: спроба POST /verify-simple з чужого origin (без cookie) → 403.
11. Open-redirect prevention: `start-diia` зі сфабрикованим `redirectUrl` (не id.diia.gov.ua) → 422.
12. Webhook signature verification: невалідний `X-Diia-Signature` → 401, документ НЕ підписується.

## Testing

### Unit (`src/lib/client-portal/__tests__/`, `src/lib/integrations/__tests__/`)
- `simple-signature.test.ts` — gen OTP 6 цифр; bcrypt verify (правильний — true, невірний — false); max 5 attempts → throw LOCKED.
- `diia-signature.test.ts` — mock-mode flow (initiate → mock-callback → signed); HMAC verify (валідна / невалідна підписи).
- `sign-orchestrator.test.ts` — SIMPLE → SignatureRequest.status transitions; idempotent (повторний sign → conflict, не дубль).
- `expirations.test.ts` — cron-функція переводить PENDING > expiresAt у EXPIRED; не чіпає вже SIGNED.
- `tokens.test.ts` — invitation token має 256 біт; signedToken JWT валідний рівно `audience="client-portal"`.

### Integration (`src/app/api/**/__tests__/`)
- `client-signature-flow.test.ts` — end-to-end SIMPLE: create → start → otp → verify → SIGNED; audit events ≥ 4.
- `diia-flow.test.ts` — start → mock callback → SIGNED; з невалідним HMAC → 401.
- `invitation-accept.test.ts` — accept створює User з role=CLIENT, Project.clientId set; повторний accept → 409 (вже used).
- `client-portal-isolation.test.ts` — Studio CLIENT не бачить Group SignatureRequest; clientA не бачить clientB documents.
- `csrf.test.ts` — POST verify-simple без X-CSRF → 403.
- `open-redirect.test.ts` — start-diia з підробленим redirectUrl host → 422.
- `rate-limit.test.ts` — 6 невалідних OTP підряд → REJECTED.

### Components
- `OtpInputModal.test.tsx` — paste "123456" → автозаповнення; submit disabled поки < 6 цифр.
- `DocumentSignaturePanel.test.tsx` — кнопки DIIA / SIMPLE правильно ховаються за flag; статус-badge коректний.
- `ChatThread.test.tsx` — нові повідомлення з polling зʼявляються; "прочитано" mark працює.

### Manual / E2E
- Smoke: створити Project з clientId → admin invite client (інша email) → отримати лінк → in incognito accept → задати пароль → залогінитись → побачити SignatureRequest → simple-sign → перевірити PDF в R2 з footer.
- Дія mock: повторити те ж, але через mock-Дія adapter — переконатись що callback приходить, документ переходить у SIGNED.
- Mobile (iPhone Safari): чат, OTP, PDF preview — все працює.
- Security audit (manual checklist):
  - [ ] Open redirect — спробувати `?redirectUrl=https://evil.com` → блок
  - [ ] CSRF — POST без token → блок
  - [ ] Token enumeration — спробувати invitation з incremental ID → 404
  - [ ] HMAC bypass у webhook — empty signature → 401
  - [ ] XSS у chat text — `<script>` → escaped
  - [ ] R2 signed URL не expired-after-leak — спроба використати посилання після 6 хв → 403

## Open Questions

1. **Дія партнерство** — чи є вже укладена угода з Мінцифрою для production? Якщо ні — стартуємо MVP лише з SIMPLE. Хто веде переговори? **Уточнити у користувача.**
2. **Юридична сила SIMPLE-підпису** — Цивільний кодекс ст. 207 дозволяє "інші форми" підпису за згодою сторін, але в договорі має бути прописано, що "сторони визнають спрощений електронний підпис". Перевірити з юристом / додати в шаблон договору пункт. **Припускаю: додаємо пункт, юрист робить шаблон.**
3. **SMS-провайдер** — який обрати? TurboSMS / SMS-Fly (UA) чи Twilio (gloбальний, дорожче)? **Припускаю: TurboSMS у MVP, бо локальний.**
4. **Чат: WebSocket vs polling** — polling простіше у MVP, але якщо вже є infra (наприклад Ably) — переходимо. **Припускаю: polling SWR refreshInterval=10s.**
5. **Чи дозволяємо клієнту бачити фінанси проєкту?** Існуючий `dashboard/finance/` показує. Перевірити з MEMORY правилом `canViewFinance() = SUPER_ADMIN only`. **КОНФЛІКТ:** memory каже "цифри лише SUPER_ADMIN". Але клієнт явно має право бачити свій бюджет / стан оплат. Припускаю: клієнт бачить ТІЛЬКИ свої totalBudget / totalPaid / nextPayment (не cost structure, не зарплати, не cost-codes). Це не порушує canViewFinance, бо це договірні цифри з клієнтом.
6. **Push notifications для портала** — web-push subscription чи лише email/sms? **Припускаю: email/sms у MVP. Web-push — окремо.**
7. **Чат attachments** — який max розмір, які типи? **Припускаю: 10 MB, лише image/* + pdf.**
8. **Чи блокувати клієнту перегляд внутрішніх чатів** через Project model? Перевірити, чи існуючий `dashboard` має доступ до якихось внутрішніх каналів. **Treat all internal chat data as off-limits — лише `ClientChatMessage` model рендеримо клієнту.**
9. **Підпис з боку Metrum** (компанії) — лишається на папері або окрема task? **Припускаю: окрема task, тут лише клієнт.**
10. **Audit-log access** — клієнт сам має бачити свій audit? Юристи кажуть так. **Припускаю: так, у Detail сторінці documents/[id].**

## References

- **Файли проєкту:**
  - `src/app/dashboard/page.tsx`, `dashboard/projects/page.tsx`, `dashboard/finance/page.tsx` (поточний стан — extending)
  - `src/app/dashboard/layout.tsx`
  - `src/lib/firm/scope.ts`, `firmWhereForProject`
  - `src/lib/auth.ts` (next-auth налаштування — додати CLIENT role у callbacks)
  - `prisma/schema.prisma`: `Project @ 122` (вже має `clientId`)
  - `src/lib/email/` — поточні шаблони, як reuse
  - `next.config.ts` — для CSP/redirect rules
- **Залежні task-и:** `02-change-orders.md`, `07-document-builder.md` (per README — у моїй нумерації Task 02 і 07)
- **MEMORY:** `project_metrum_finance_access_rule.md`, `project_metrum_full_firm_isolation.md`, `project_metrum_migrations_workflow.md`, `project_metrum_bot_notifications_requirement.md` (інтеграція з bot для нотифікацій клієнту чи лише PM?)
- **External:**
  - [Дія.Підпис — Open API docs](https://api.diia.gov.ua/) — endpoints, OAuth flow, callback specs. *Потребує реєстрації партнера.*
  - [Закон України про електронні довірчі послуги](https://zakon.rada.gov.ua/laws/show/2155-19) — QES legal foundation
  - [Цивільний кодекс ст. 207](https://zakon.rada.gov.ua/laws/show/435-15) — форма правочину
  - [next-auth Credentials provider](https://next-auth.js.org/providers/credentials) — для invitation-accept auto-login pattern
  - [OWASP — Preventing Open Redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
  - [@react-email/components](https://react.email/) — email templates
  - [TurboSMS API](https://turbosms.ua/api.html) — UA SMS-провайдер
