# Task 06 — AI Document Control

> Priority: 🟡 HIGH | Estimate: 3-4 тижні | Owner: ___

## Mission

Розширити існуючий foreman AI-парс витрат на **весь документообіг** Metrum: інвойси, комерційні пропозиції, договори, акти виконаних робіт, КБ-2в, КБ-3, чеки. Будь-який документ (PDF / фото / скан / forwarded email) → AI extract → auto-fill metadata → auto-link to project/counterparty/cost code → human review → save with cascade (створення `FinanceEntry`, привʼязка до `ChangeOrder`, тощо).

Мета: усунути ручний ввід полів з паперових/PDF документів, які бухгалтер/менеджер сьогодні набирає руками.

## Context

- **Stack:** Next.js 15 App Router + React 19 + TypeScript + Tailwind v4 + Prisma + PostgreSQL (Railway) + Cloudflare R2.
- **Multi-firm:** усі нові моделі мають `firmId` FK + йдуть через `resolveFirmScope` з `src/lib/firm/scope.ts`.
- **AI:** Anthropic Claude + Gemini вже в `src/lib/ai-assistant/` (executors, prompts). Foreman парс уже працює — `src/lib/foreman/` + `src/app/api/foreman/reports/`.
- **R2:** файли вже зберігаються в Cloudflare R2 — переcory використати існуючий upload helper.
- **Counterparties:** модель `Counterparty` (`prisma/schema.prisma:3268`) має поля `name`, `edrpou`, `taxId`, `iban`, `roles` — використати для fuzzy match.
- **Foreman flow як референс:** `текст/фото/PDF → AI парс → ForemanReport(DRAFT) → manager approve → FinanceEntry(kind=FACT, source=FOREMAN_REPORT)`. Документообіг будується аналогічно, але узагальнено для всіх типів.

## Business Goal

- **80% інвойсів** (PDF/фото) обробляються без ручного вводу полів (тільки click "Confirm").
- **<5%** документів вимагають повторного завантаження через помилки парсингу.
- Час від отримання документа до запису у фінансах: **<2 хв** (проти ~10 хв ручного вводу).
- Усі вхідні документи централізовано у "Inbox" з audit-trail.

## Out of Scope

- E-Doc workflow (підписання, KEP / Дія) — окрема task.
- Internal generation документів (генерація КП/договорів **з** Metrum) — окрема task.
- Архівне зберігання >2 років (R2 lifecycle policy) — DevOps task.
- ChangeOrder створення з RFI — це task 07.

## Prerequisites

- [ ] Task 01 Cost Codes — щоб auto-link cost code мав до чого привʼязуватися.
- [ ] Питання: який OCR engine для нечітких сканів — Mistral OCR / GPT-4 Vision / Google Document AI? (див. Open Questions)
- [ ] DevOps: налаштувати inbound email (SendGrid Inbound Parse або власний MX-receiver) для `docs@metrum.ua`.
- [ ] R2 bucket з retention policy для `incoming-documents/*`.

## 🚨 Parallel Conflicts

- `prisma/schema.prisma` — нові моделі `IncomingDocument`, `DocumentExtractionLog`, нові enums. **Конфлікт** з будь-якою іншою міграцією, що йде паралельно.
- `src/lib/ai-assistant/` — конфлікт з task 02 (якщо паралельно розширюємо AI tools).
- `src/lib/foreman/` — спільна функція OCR/extractor може бути винесена в `src/lib/ai/document-extractor.ts`; foreman переключити на неї пізніше — координувати з власником foreman.
- `src/app/admin-v2/_lib/nav.ts` — додавання нового пункту меню "Документи / Inbox".
- `src/app/api/admin/uploads/` — якщо існує загальний upload endpoint, узгодити прийом великих файлів (>10 MB).

## Data Model (Prisma)

```prisma
enum IncomingDocumentType {
  INVOICE              // рахунок-фактура
  CONTRACT             // договір
  ACT                  // акт виконаних робіт
  COMMERCIAL_OFFER     // комерційна пропозиція (КП)
  RECEIPT              // чек
  KB2V                 // форма КБ-2в
  KB3                  // форма КБ-3
  WAYBILL              // ТТН / накладна
  OTHER
}

enum IncomingDocumentSource {
  UPLOAD               // ручне завантаження з admin-v2
  EMAIL                // forward на docs@metrum.ua
  FOREMAN              // прийшло від виконроба з foreman PWA
  SCAN                 // зі сканера (Scanbot/Scanner-as-a-Service)
  API                  // зовнішня система через REST
}

enum IncomingDocumentStatus {
  PROCESSING           // у черзі / йде AI extract
  PARSED               // AI обробив, чекає review
  REVIEWED             // людина підтвердила
  LINKED               // привʼязано до сутності (FinanceEntry / ChangeOrder тощо)
  ARCHIVED             // в архів (для compliance)
  FAILED               // помилка обробки (errorMessage)
}

enum LinkedEntityType {
  FINANCE_ENTRY
  PROJECT
  CHANGE_ORDER
  KB2_FORM
  KB3_FORM
  COUNTERPARTY
  NONE
}

model IncomingDocument {
  id                String                 @id @default(cuid())
  firmId            String
  type              IncomingDocumentType
  source            IncomingDocumentSource
  status            IncomingDocumentStatus @default(PROCESSING)

  originalFileUrl   String                 // R2 URL
  originalFileName  String
  fileSizeBytes     Int
  mimeType          String

  /// Сирий JSON з AI: counterparty, edrpou, amount, vat, date, items[], etc.
  extractedData     Json?
  /// 0..1 — впевненість AI у extract'і (середнє по полям). <0.7 → manual review.
  confidence        Decimal?               @db.Decimal(3, 2)

  /// Хто завантажив (для EMAIL — system user; для FOREMAN — viconrob).
  uploadedById      String
  uploadedAt        DateTime               @default(now())

  /// Хто переглянув і підтвердив.
  reviewedById      String?
  reviewedAt        DateTime?

  /// До якої сутності привʼязано після REVIEWED.
  linkedEntityType  LinkedEntityType       @default(NONE)
  linkedEntityId    String?

  /// Email-source мета: оригінальна From-адреса, subject, msg-id.
  emailFrom         String?
  emailSubject      String?
  emailMessageId    String?                @unique

  errorMessage      String?
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  firm              Firm                   @relation(fields: [firmId], references: [id])
  uploadedBy        User                   @relation("DocUploader", fields: [uploadedById], references: [id])
  reviewedBy        User?                  @relation("DocReviewer", fields: [reviewedById], references: [id])
  extractionLogs    DocumentExtractionLog[]

  @@index([firmId, status])
  @@index([firmId, type])
  @@index([uploadedAt])
  @@index([linkedEntityType, linkedEntityId])
  @@map("incoming_documents")
}

model DocumentExtractionLog {
  id            String   @id @default(cuid())
  documentId    String
  model         String   // "claude-3-5-sonnet" | "gemini-2.0-flash" | "gpt-4-vision" | "mistral-ocr"
  prompt        String   @db.Text
  response      String   @db.Text
  tokensInput   Int?
  tokensOutput  Int?
  durationMs    Int
  success       Boolean
  errorMessage  String?
  createdAt     DateTime @default(now())

  document      IncomingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([model, success])
  @@map("document_extraction_logs")
}
```

## Migration Strategy

1. Створити міграцію локально на одноразовій БД: `prisma migrate dev --name add_incoming_documents --create-only`.
2. **НЕ** запускати `migrate dev` проти Railway prod.
3. Перенести SQL у `prisma/migrations/<timestamp>_add_incoming_documents/migration.sql`.
4. Запустити `prisma migrate deploy` на staging → smoke test → prod.
5. Backfill не потрібен — нова сутність.

## API Endpoints

| Method | Path | Призначення |
|---|---|---|
| POST | `/api/admin/documents/upload` | multipart upload → R2 → створює `IncomingDocument(PROCESSING)` → enqueue extraction job |
| POST | `/api/webhooks/email/inbound` | SendGrid Inbound Parse webhook → attachment → upload pipeline |
| GET  | `/api/admin/documents` | list з фільтрами `status`, `type`, `source`, `dateFrom/To`, pagination |
| GET  | `/api/admin/documents/:id` | повний документ + `extractedData` + extraction logs |
| PATCH | `/api/admin/documents/:id` | оновити `extractedData` після ручного review |
| POST | `/api/admin/documents/:id/review` | mark REVIEWED |
| POST | `/api/admin/documents/:id/link` | каскад: створити `FinanceEntry` (або інше) + set `linkedEntity*` + status=LINKED |
| POST | `/api/admin/documents/:id/reprocess` | повторний AI extract (наприклад зі зміненим типом) |
| POST | `/api/admin/documents/:id/archive` | status=ARCHIVED |
| POST | `/api/admin/documents/:id/suggest-links` | AI повертає top-3 candidate counterparty/project/cost-code |

Всі endpoints — `requireRole([SUPER_ADMIN, MANAGER, FINANCIER])` + перевірка `firmId` через `resolveFirmScope`.

## UI Changes

- `src/app/admin-v2/documents/inbox/page.tsx` — **новий**. Drag-drop zone + список (status-tabs: All / Processing / Parsed / Reviewed / Linked / Failed). Email-forward інструкція (адреса `docs@metrum.ua`).
- `src/app/admin-v2/documents/[id]/page.tsx` — **новий**. Splitscreen: ліворуч PDF/image viewer (через `react-pdf` або iframe), праворуч prefilled-форма з полями extracted + confidence indicator (color-coded: green ≥0.9, yellow 0.7-0.9, red <0.7).
- `src/app/admin-v2/documents/_components/document-link-cascade.tsx` — компонент-майстер: "Linked entity" select → форма каскаду (для INVOICE → `FinanceEntry` форма prefilled).
- `src/app/admin-v2/_lib/nav.ts` — додати пункт "Документи" з badge-лічильником `status=PARSED` (action required).
- `src/components/document-confidence-badge.tsx` — переcory компонент для confidence indicator.

## Backend Architecture

```
src/lib/ai/document-extractor.ts          # generic AI extractor
src/lib/ai/prompts/documents/
  invoice.ts                              # type-specific prompts
  contract.ts
  act.ts
  commercial-offer.ts
  kb2v.ts
  kb3.ts
  receipt.ts
  waybill.ts
src/lib/ai/document-auto-link.ts          # counterparty/project/cost-code resolver
src/lib/ai/ocr-fallback.ts                # OCR fallback for poor scans
src/lib/email-inbound/parse-mime.ts       # MIME parser (SendGrid payload → attachments)
src/lib/queue/document-extraction.ts      # pg-boss worker
src/lib/integrations/sendgrid-inbound.ts  # webhook signature verify
```

### Generic extractor signature

```typescript
// src/lib/ai/document-extractor.ts
export interface ExtractedData {
  type: IncomingDocumentType;
  counterparty?: { name?: string; edrpou?: string; iban?: string };
  project?: { keyword?: string; address?: string };
  costCodeSuggestions?: Array<{ code: string; label: string; confidence: number }>;
  amountTotal?: number;
  amountVat?: number;
  currency?: string;
  documentDate?: string;       // ISO
  documentNumber?: string;
  paymentTermsDays?: number;
  items?: Array<{ name: string; qty: number; unit: string; price: number; total: number }>;
  raw: Record<string, unknown>;
  fieldConfidence: Record<string, number>; // per-field 0..1
  overallConfidence: number;
}

export async function extractDocument(
  fileBuffer: Buffer,
  mimeType: string,
  expectedType?: IncomingDocumentType,
): Promise<ExtractedData>;
```

### Auto-link logic

1. **Counterparty match:**
   - Якщо `edrpou` extracted → exact match `Counterparty.edrpou` у scope.firmId.
   - Fallback: Levenshtein distance на `name` (поріг ≤3 символів або ratio ≥0.85).
   - Якщо нема — позначити "New counterparty proposed" + кнопка create.
2. **Project match:**
   - Keyword extract з тексту (address tokens / project title tokens) → match `Project.title` ILIKE / `Project.address` ILIKE.
   - Якщо ≥2 кандидати — попросити user обрати.
3. **Cost Code suggest (потребує task 01):**
   - Передати top-N описів робіт у Claude з task-prompt "Suggest cost code" → top-3 з confidence.
   - Зберегти у `extractedData.costCodeSuggestions`.

### Confidence thresholds

- `overallConfidence ≥ 0.9` → status=PARSED + auto-notify reviewer (не auto-link без human).
- `0.7 ≤ overallConfidence < 0.9` → status=PARSED, badge "Review required".
- `overallConfidence < 0.7` → status=PARSED, badge "Low confidence — manual fix".
- Failure (no JSON, exception) → status=FAILED, errorMessage.

### Batch / async

- `pg-boss` queue (вже в проєкті — або додати): job `document.extract` приймає `documentId`.
- Worker у `src/workers/document-extraction.ts` запускається окремим процесом (Railway service).
- Retry: 3 спроби з expo backoff. Після — status=FAILED.

## Implementation Plan

1. [ ] Прочитати `src/lib/foreman/` — зрозуміти існуючий AI parse flow і фактори (chunking, prompt size).
2. [ ] Узгодити OCR engine (Open Question) → закласти adapter pattern.
3. [ ] Створити enums + моделі `IncomingDocument`, `DocumentExtractionLog` у `prisma/schema.prisma`.
4. [ ] Згенерувати міграцію на локальній throwaway-БД.
5. [ ] Створити `src/lib/ai/document-extractor.ts` з generic API + 1-й type (INVOICE).
6. [ ] Написати type-specific prompt `src/lib/ai/prompts/documents/invoice.ts` з fixture-документами.
7. [ ] Налаштувати `pg-boss` queue + worker `src/workers/document-extraction.ts`.
8. [ ] API: `POST /api/admin/documents/upload` (multipart → R2 → DB → enqueue).
9. [ ] API: GET list + GET detail + PATCH.
10. [ ] UI: `admin-v2/documents/inbox/page.tsx` (drag-drop + list).
11. [ ] UI: `admin-v2/documents/[id]/page.tsx` (splitscreen viewer + form).
12. [ ] Auto-link: counterparty resolver (edrpou + Levenshtein).
13. [ ] Auto-link: project resolver (keyword match).
14. [ ] Cascade: `POST /:id/link` → створення `FinanceEntry` з prefilled полями.
15. [ ] Додати решту типів: CONTRACT, ACT, KB2V, KB3, RECEIPT, COMMERCIAL_OFFER, WAYBILL.
16. [ ] Email inbound: SendGrid Inbound Parse webhook + signature verify.
17. [ ] Notifications: `notifyUsers` коли документ PARSED для reviewer (роль FINANCIER per firm).
18. [ ] Confidence indicators у UI form (color-coded per field).
19. [ ] Tests: extractor regression (fixtures), Levenshtein edge cases, ЄДРПОУ checksum.
20. [ ] Документація для бухгалтера: `docs/operations/document-inbox-guide.md`.

## Acceptance Criteria

- [ ] Завантаження PDF інвойсу (1-стор., чіткий) → за <15 сек статус PARSED + усі поля заповнені (counterparty, amount, vat, date, number) з confidence ≥0.9 на ≥4 з 5 полях.
- [ ] Email на `docs@metrum.ua` з attachment → за <30 сек зʼявляється у Inbox з status=PARSED.
- [ ] Counterparty з відомим ЄДРПОУ → 100% match (exact).
- [ ] Counterparty з опискою у назві (наприклад "ТОВ Будматеріали Плюс" → у базі "ТОВ "Будматеріали-Плюс"") → match через Levenshtein.
- [ ] Click "Link → FinanceEntry" → створюється `FinanceEntry(kind=FACT, source=DOCUMENT_INBOX)` з полями з документа.
- [ ] Multi-firm: документ завантажений у `metrum-studio` НЕ видно під `metrum-group` user.
- [ ] Document з confidence <0.7 — UI чітко вимагає manual fix перш ніж дозволити Link.
- [ ] Audit: на сторінці документа видно повний `DocumentExtractionLog` (для дебагу).
- [ ] FAILED документ можна reprocess однією кнопкою (з вибором іншого type).
- [ ] Усі endpoints перевіряють `firmId` scope (тест).

## Testing

- **Unit:**
  - `extractDocument()` з fixture invoices/contracts (mock AI response).
  - Levenshtein counterparty match: edge cases (different cases, lapping, апостроф, дефіс).
  - ЄДРПОУ extraction regex (8 vs 10 digits) + checksum validation.
  - Confidence aggregation (mean over field confidences).
- **Integration:**
  - End-to-end upload → enqueue → worker run (з mocked AI) → DB зміна.
  - SendGrid webhook payload (fixture) → IncomingDocument створено.
  - `POST /:id/link` створює FinanceEntry з правильним firmId scope.
- **Manual:**
  - 10 реальних PDF з різних постачальників → measure % auto-pass.
  - Скан-фото з кутом / поганим освітленням → перевірити OCR fallback.
  - Forward email з outlook → check parse.
- **Prompt regression:**
  - `src/lib/ai/prompts/documents/__tests__/fixtures/` — eval suite на 20+ документах, fail якщо accuracy drop >5%.

## Open Questions

- [ ] **OCR engine для нечітких сканів:** Mistral OCR (дешево, європейський хостинг) vs Google Document AI (точніше, але GDPR/локалізація?) vs GPT-4 Vision (universal, але дорого per page)? Рекомендація: почати з Gemini 2.0 Flash (multimodal) + fallback на Mistral OCR для випадків, де Gemini повертає "unreadable".
- [ ] **Email inbound provider:** SendGrid Inbound Parse (€20/міс) vs власний MX + Postfix? SendGrid швидше до production.
- [ ] **Дублікати:** якщо той самий PDF приходить двічі (forward + manual upload) — як деdup? Кандидат: SHA-256 хеш файлу + унікальний індекс на `(firmId, fileHash)`.
- [ ] **KEP / e-signed PDF:** парсити підписаний документ як звичайний PDF чи спочатку validate signature? У scope чи окрема task?
- [ ] **Auto-link confidence threshold для auto-create FinanceEntry без human:** взагалі не робити (завжди human) чи дозволити для повторюваних постачальників з історією успіху?
- [ ] **Storage retention:** скільки тримати оригінали в R2? Юридичні вимоги — 3 роки. Закласти lifecycle policy.
- [ ] **Foreman інтеграція:** чи переключати існуючий foreman parse на новий `document-extractor`, чи лишити окремо? Рекомендація — лишити окремо в фазі 1, рефакторити пізніше.

## References

- `prisma/schema.prisma:3268` — `Counterparty` model (для auto-link).
- `src/lib/foreman/` — існуючий AI parse flow (референс).
- `src/app/api/foreman/reports/` — existing API pattern.
- `src/lib/firm/scope.ts` — `resolveFirmScope` (обовʼязково використовувати).
- `src/lib/ai-assistant/tool-executors.ts` — приклад AI tool pattern.
- `src/lib/auth.ts` — `requireRole` helper.
- SendGrid Inbound Parse docs: <https://docs.sendgrid.com/for-developers/parsing-email/inbound-email>
- pg-boss: <https://github.com/timgit/pg-boss>
- Task 01 (Cost Codes) — prerequisite для cost-code auto-suggest.
- Task 07 (RFI) — комплементарна, може ділити email inbound.
- Task 08 (SRM) — потребує сирі документи (LICENSE, INSURANCE) → можуть потрапляти через цей же flow.
