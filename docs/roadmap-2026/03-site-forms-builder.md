# Task 03 — Site Forms Builder

> Priority: 🔴 MUST-HAVE | Estimate: 4-5 тижнів | Owner: ___

## Mission

Побудувати no-code конструктор кастомних форм для foreman PWA: адмін з admin-v2 drag-n-drop збирає шаблон (КБ-2в, ТБ-інструктаж, прихований акт, щоденний рапорт, інспекція якості, custom). Прораб на об’єкті заповнює форму офлайн з телефона/планшета (фото, підпис, GPS), pending submissions кешуються у IndexedDB і автоматично сінкаються при появі мережі через існуючий Service Worker (SW v5.3.0). Заповнені форми йдуть на approval у admin-v2, експортяться в PDF за офіційним layout (для КБ-2в — обов’язково), лінкуються до Project / ForemanReport / Task.

## Context

- Канонічний admin UI: `src/app/admin-v2/*`
- Foreman PWA: `src/app/foreman/*` (вже працює офлайн, SW v5.3.0)
- Foreman flow: `текст/фото/PDF/Excel → AI → ForemanReport(DRAFT) → manager approve → FinanceEntry(kind=FACT)`
- Stack: Next.js 15 App Router, React 19, Tailwind v4, Prisma, R2 (вкладення), next-auth
- DnD у проєкті: `@dnd-kit/core` (вже встановлено, використовується у Kanban-задачах)
- Multi-firm: усі моделі — `firmId String?` + indexed; читання через `resolveFirmScope` з `src/lib/firm/scope.ts`

## Business Goal

Будівельна документація сьогодні живе у Viber-фото, паперових журналах і Excel-табличках. Це означає:
- Втрата актів і журналів безпеки (штрафи при перевірках Держпраці).
- Час менеджера на ручне переписування з фото в КБ-2в.
- Відсутність аудит-сліду (хто, коли, де підписав).

Метрика: **80% щоденних рапортів і ТБ-інструктажів подаються через форми за 6 тижнів після запуску**; **час на оформлення КБ-2в скорочено з 40 хв до 5 хв**.

## Out of Scope

- E-підпис з КЕП/Дія.Підпис (юридично-значущий) — лише canvas-підпис як evidence
- Друк/інтеграція з Дія.Сертифікат — окремий task
- Складна conditional logic (показ полів за умовою) — v2; зараз тільки `visibleIf` примітив
- Workflow з N етапами апрува — поки що 1-step (submit → approve/reject)
- Версіонування з повним diff history — лише `version: int` + immutable `templateVersion` на submission

## Prerequisites

- [ ] Підтвердити, що SW v5.3.0 уже підтримує Background Sync API (інакше форсимо queue в Cache + flush при `online` event)
- [ ] Питання користувачу: який саме layout для КБ-2в використовуємо — наказ Мінрегіону №65 або корпоративна модифікація? (потрібен зразок DOCX/PDF)
- [ ] Питання користувачу: чи треба multi-language шаблони (UA/EN)? (вплине на schema — `labels: { uk, en }`)
- [ ] Задача 04 (Equipment) — якщо паралельно, координувати міграції schema.prisma

## 🚨 Parallel Conflicts

Цей task редагує:
- `prisma/schema.prisma` — **КОНФЛІКТ із 04 і 05**. Серіалізувати міграції: 03 → 04 → 05.
- `src/app/foreman/page.tsx`, `src/app/foreman/_components/*` — **КОНФЛІКТ з 04** (equipment scanner у foreman). Доменна підпапка `src/app/foreman/forms/` своя — поза конфліктом.
- `src/app/admin-v2/_lib/nav.ts` — додаємо пункт “Шаблони форм” → **конфлікт з усіма nav-міняючими тасками**.
- `public/sw.js` / `src/lib/pwa/sw-template.ts` (SW v5.3.0) — додавання нового queue → версія SW піднімається до v5.4.0; будь-який інший таск, що чіпає SW, має ребейзити.
- `src/lib/constants.ts` — додаємо `FORM_CATEGORY_LABELS`.
- R2 bucket: новий префікс `form-submissions/{submissionId}/{attachmentId}` — конфліктів немає, але повідомити devops про lifecycle policy.

## Data Model (Prisma)

```prisma
// === Site Forms Builder ===

enum FormCategory {
  DAILY_REPORT       // Щоденний рапорт прораба
  SAFETY             // ТБ-інструктаж
  QUALITY            // Інспекція якості
  ACCEPTANCE         // Акт прихованих робіт / приймання
  KB2V               // КБ-2в (форма Мінрегіону)
  KB3                // КБ-3 (довідка вартості)
  CUSTOM
}

enum FormSubmissionStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
}

/// Шаблон форми. schema — JSON: { fields: FieldDef[], meta: {...} }.
/// version інкрементиться на КОЖНУ зміну schema (immutable history через FormTemplateRevision).
model FormTemplate {
  id          String       @id @default(cuid())
  firmId      String?
  name        String
  description String?
  category    FormCategory @default(CUSTOM)
  schema      Json
  version     Int          @default(1)
  isActive    Boolean      @default(true)
  createdById String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  firm        Firm?                    @relation(fields: [firmId], references: [id])
  createdBy   User                     @relation("FormTemplateCreator", fields: [createdById], references: [id])
  submissions FormSubmission[]
  revisions   FormTemplateRevision[]

  @@index([firmId, category, isActive])
  @@map("form_templates")
}

/// Immutable snapshot минулих версій schema. Підкріплюється до submission,
/// щоб через рік можна було рендерити стару форму як її подавали.
model FormTemplateRevision {
  id         String   @id @default(cuid())
  templateId String
  version    Int
  schema     Json
  createdAt  DateTime @default(now())
  createdById String
  changeNote String?

  template  FormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  createdBy User         @relation("FormTemplateRevisionAuthor", fields: [createdById], references: [id])

  @@unique([templateId, version])
  @@map("form_template_revisions")
}

/// Заповнена форма. templateVersion — snapshot версія для backward compat.
/// data — JSON map fieldKey → value (string | number | bool | string[] | { lat, lng } | attachmentId[]).
model FormSubmission {
  id              String               @id @default(cuid())
  firmId          String?
  templateId      String
  templateVersion Int
  projectId       String?
  taskId          String?
  foremanReportId String?
  submittedById   String
  data            Json
  status          FormSubmissionStatus @default(DRAFT)
  submittedAt     DateTime?
  reviewedById    String?
  reviewedAt      DateTime?
  reviewNote      String?
  clientUuid      String?              @unique // ідентифікатор з IndexedDB для idempotent sync
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  firm          Firm?                      @relation(fields: [firmId], references: [id])
  template      FormTemplate               @relation(fields: [templateId], references: [id], onDelete: Restrict)
  project       Project?                   @relation(fields: [projectId], references: [id])
  task          Task?                      @relation(fields: [taskId], references: [id])
  foremanReport ForemanReport?             @relation(fields: [foremanReportId], references: [id])
  submittedBy   User                       @relation("FormSubmissionAuthor", fields: [submittedById], references: [id])
  reviewedBy    User?                      @relation("FormSubmissionReviewer", fields: [reviewedById], references: [id])
  attachments   FormSubmissionAttachment[]

  @@index([firmId, status])
  @@index([templateId, templateVersion])
  @@index([projectId])
  @@index([submittedById, status])
  @@map("form_submissions")
}

/// Вкладення (фото поля photo, файли поля file). Підпис canvas/signature
/// зберігається inline у data JSON як base64 PNG ≤ 30KB (інакше — теж сюди).
model FormSubmissionAttachment {
  id            String   @id @default(cuid())
  submissionId  String
  fieldKey      String   // ключ поля в schema
  r2Key         String
  fileName      String
  contentType   String
  sizeBytes     Int
  createdAt     DateTime @default(now())

  submission FormSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)

  @@index([submissionId])
  @@map("form_submission_attachments")
}
```

**Field schema (TS, не Prisma):** у `src/lib/forms/schema.ts`

```ts
export type FieldType =
  | 'text' | 'longtext' | 'number' | 'date' | 'datetime'
  | 'select' | 'multiselect' | 'checkbox'
  | 'photo' | 'signature' | 'gps' | 'file' | 'section';

export type FieldDef = {
  key: string;              // unique within template, snake_case
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  options?: { value: string; label: string }[]; // select/multiselect
  min?: number; max?: number; pattern?: string; // validation
  multiple?: boolean;       // для photo/file
  visibleIf?: { fieldKey: string; equals: unknown }; // примітив conditional
};

export type FormSchema = {
  fields: FieldDef[];
  meta?: { headerLogo?: boolean; pdfTemplate?: 'KB2V' | 'KB3' | 'DEFAULT' };
};
```

## Migration Strategy

1. `prisma migrate dev --create-only --name add_site_forms` локально проти throwaway-БД.
2. Інспекція згенерованого SQL — переконатися, що НЕМАЄ DROP/ALTER на existing tables (тільки CREATE).
3. Edit migration: жодних `DROP COLUMN` (їх і не має бути для нових моделей).
4. Commit migration в репо.
5. На prod: `npx prisma migrate deploy` (через CI або вручну, але БЕЗ `--shadow-database-url`).
6. Seed pre-built templates окремим скриптом `scripts/seed-form-templates.ts` (idempotent: upsert by `name + firmId`).

## API Endpoints

### Admin

- `GET    /api/admin/form-templates?firmId=&category=` — список з пагінацією
- `POST   /api/admin/form-templates` — body: `{ name, category, schema, firmId? }` → створює template v1 + revision
- `GET    /api/admin/form-templates/:id` — current schema
- `GET    /api/admin/form-templates/:id/revisions/:v` — стара версія
- `PUT    /api/admin/form-templates/:id` — body: `{ name?, schema?, isActive?, changeNote? }` → якщо schema змінилась → version++ + новий revision
- `DELETE /api/admin/form-templates/:id` — soft (isActive=false), реальний DELETE заборонений якщо є submissions
- `POST   /api/admin/form-templates/:id/duplicate` — копія v1
- `GET    /api/admin/form-submissions?status=&templateId=&projectId=` — для review queue
- `POST   /api/admin/form-submissions/:id/approve` — body: `{ reviewNote? }`
- `POST   /api/admin/form-submissions/:id/reject` — body: `{ reviewNote }`
- `GET    /api/admin/form-submissions/:id/pdf` — application/pdf

### Foreman

- `GET    /api/foreman/form-templates` — list активних, filter по firmId через session
- `GET    /api/foreman/form-templates/:id` — для рендеру
- `POST   /api/foreman/form-submissions` — body: `{ clientUuid, templateId, templateVersion, projectId?, taskId?, data, attachmentTokens[] }` → idempotent по `clientUuid`
- `POST   /api/foreman/form-submissions/:id/attachment` — multipart upload (1 файл/реквест); повертає `{ attachmentId, r2Key }`. На клієнті заздалегідь готується presigned URL стратегія (як для ForemanReportAttachment).

**Validation:** усі POST/PUT — через Zod схеми у `src/lib/forms/validators.ts`. RBAC через існуючий `requireRole(['SUPER_ADMIN','MANAGER','HR'])` для admin endpoints; foreman endpoints — `requireRole(['FOREMAN','SUPER_ADMIN','MANAGER'])`.

## UI Changes

### Admin (admin-v2)

- `src/app/admin-v2/catalogs/form-templates/page.tsx` — list (table з name, category, version, кількість submissions, isActive toggle, дії)
- `src/app/admin-v2/catalogs/form-templates/[id]/page.tsx` — builder (split view: left = sortable fields list з @dnd-kit, center = canvas з полями, right = field editor panel)
- `src/app/admin-v2/catalogs/form-templates/[id]/preview.tsx` — modal-preview як це бачитиме foreman
- `src/app/admin-v2/catalogs/form-templates/[id]/revisions.tsx` — список версій + diff
- `src/app/admin-v2/catalogs/form-templates/_components/FieldEditor.tsx` — універсальний редактор поля
- `src/app/admin-v2/catalogs/form-templates/_components/FieldPalette.tsx` — palette з типами полів (drag source)
- `src/app/admin-v2/queue/form-submissions/page.tsx` — review queue (approve/reject)
- `src/app/admin-v2/queue/form-submissions/[id]/page.tsx` — детальний перегляд + PDF download
- `src/app/admin-v2/_lib/nav.ts` — додати пункти “Шаблони форм” і “Заповнені форми”
- `src/lib/constants.ts` — додати `FORM_CATEGORY_LABELS`

### Foreman PWA

- `src/app/foreman/forms/page.tsx` — список доступних шаблонів (cards, групування по category)
- `src/app/foreman/forms/[templateId]/page.tsx` — generic renderer, читає schema, рендерить FormFieldRenderer
- `src/app/foreman/forms/[templateId]/_components/FormFieldRenderer.tsx` — switch по FieldType
- `src/app/foreman/forms/_components/SignaturePad.tsx` — `<canvas>` + touch events → base64
- `src/app/foreman/forms/_components/PhotoCapture.tsx` — `<input type="file" accept="image/*" capture="environment">`
- `src/app/foreman/forms/_components/GpsField.tsx` — `navigator.geolocation.getCurrentPosition` + manual fallback
- `src/app/foreman/forms/queue/page.tsx` — список pending submissions з IndexedDB (повторити sync вручну)

### Shared lib

- `src/lib/forms/schema.ts` — TS типи + Zod validators
- `src/lib/forms/validators.ts` — server-side
- `src/lib/forms/pdf/kb2v.ts` — pdfkit/pdf-lib генератор за офіційним layout
- `src/lib/forms/pdf/default.ts` — generic PDF з полів
- `src/lib/forms/offline-queue.ts` — IndexedDB wrapper (idb library) + sync logic
- `public/sw.js` — додати queue `form-submissions-outbox` з replay при `sync` або `online` event; SW version → `5.4.0`

## Implementation Plan

1. [ ] **Schema & migration** (день 1-2): додати 3 моделі + enums, локальна міграція, peer review.
2. [ ] **Seed pre-built templates** (день 2): скрипт + JSON для КБ-2в, КБ-3, ТБ-інструктажу, прихованих робіт, щоденного рапорту, інспекції якості.
3. [ ] **Schema TS types + Zod** (день 3): `src/lib/forms/schema.ts` + `validators.ts` + unit-тести на валідацію FieldDef.
4. [ ] **API admin CRUD** (день 4-6): templates CRUD + versioning logic + revisions.
5. [ ] **API foreman list + submit** (день 6-7): submit з clientUuid idempotency + attachment upload.
6. [ ] **Builder UI shell** (тиждень 2): сторінка catalogs/form-templates + list + create modal.
7. [ ] **Builder DnD canvas** (тиждень 2-3): @dnd-kit (sortable + draggable з palette).
8. [ ] **FieldEditor для всіх типів** (тиждень 3): окремі форми редагування props по типу поля.
9. [ ] **Preview modal** (тиждень 3): рендерить як foreman.
10. [ ] **Foreman renderer** (тиждень 3-4): FormFieldRenderer + усі field components.
11. [ ] **Offline queue + SW** (тиждень 4): IndexedDB outbox + SW v5.4.0 з retry policy (exponential backoff, max 5).
12. [ ] **PDF export DEFAULT** (тиждень 4): pdf-lib generic layout.
13. [ ] **PDF export KB2V** (тиждень 4-5): піксель-перфект layout за наказом Мінрегіону.
14. [ ] **Review queue UI** (тиждень 5): approve/reject + reviewNote.
15. [ ] **Link to Project/Task/ForemanReport** (тиждень 5): UI пікер у submission.
16. [ ] **Tests** (паралельно): unit для schema/validators/pdf, integration для API, e2e для offline queue.
17. [ ] **Telegram bot нотифікації** (тиждень 5): submission SUBMITTED → DM менеджеру; APPROVED/REJECTED → DM прорабу.
18. [ ] **Docs + screencast** (тиждень 5): admin how-to (1 page).
19. [ ] **Beta з 2 бригадами** (тиждень 5): фідбек → bugfix.
20. [ ] **Production rollout** + monitoring (Sentry + custom metric “submission_sync_failures”).

## Acceptance Criteria

- [ ] Admin може створити шаблон з ≥ 10 полями різних типів і зберегти; повторне відкриття показує ідентичний стан.
- [ ] Зміна schema → version=2; submission зі старого шаблону рендериться у revision-v1 layout.
- [ ] Foreman з вимкненим WiFi може заповнити форму, додати 3 фото і підпис; при увімкненні мережі submission з’являється в admin queue у межах 30 с.
- [ ] Idempotent submit: повторний POST з тим самим `clientUuid` повертає 200 + існуючий id, без дубліката.
- [ ] PDF КБ-2в збігається з офіційним зразком при візуальному порівнянні (≤ 2px відхилення на A4 300 DPI).
- [ ] Multi-firm: Studio foreman бачить ТІЛЬКИ Studio шаблони. Покрито тестом `scope.test.ts`.
- [ ] RBAC: foreman не може робити approve/reject (403); admin без `firmId` access — 403.
- [ ] Soft-delete template не ламає старі submissions (вони рендеряться з revision snapshot).
- [ ] Lighthouse PWA score для `/foreman/forms` ≥ 90.
- [ ] Sync queue не блокує UI: 50 pending submissions sync без freeze на iPhone 12.

## Testing

- **Unit:**
  - `schema.test.ts` — Zod валідатор FieldDef (всі типи, edge cases: empty options, негативний min, regex з помилкою).
  - `validators.test.ts` — submission data відповідає schema (required missing → 400; type mismatch).
  - `critical-path-of-versioning.test.ts` — change schema → version++; same schema → не змінюється.
  - `pdf/kb2v.test.ts` — генерація PDF з фіксованими даними → snapshot binary hash.
- **Integration:**
  - `api/admin/form-templates.int.test.ts` — повний CRUD + multi-firm scope.
  - `api/foreman/form-submissions.int.test.ts` — idempotent submit з clientUuid race (concurrent POST).
  - `version-migration.int.test.ts` — submit у v1, потім template → v2, потім GET submission → старий revision.
- **Manual / E2E:**
  - Playwright: builder DnD сценарій (drag поля з palette, перевпорядкування, save).
  - Manual mobile: офлайн-флоу на реальному iPhone (Safari) і Android (Chrome) — flight mode → fill → online → sync.
  - Conflict: 2 admin одночасно правлять template → оптимістична блокування через `updatedAt` mismatch (409).

## Open Questions

- [ ] Чи треба підтримка batch-submit (10 однотипних форм за один проїзд об’єктами)?
- [ ] Скільки часу зберігати DRAFT submissions у IndexedDB якщо foreman їх не submit-нув (auto-purge через 7 днів?)
- [ ] Дозволити foreman редагувати submitted submission до approve, чи immutable?
- [ ] PDF: чи треба watermark “DRAFT” для не-approved?
- [ ] Whether to use `pdf-lib` (pure JS, легше) vs `puppeteer` (HTML→PDF, складніше deploy, але краще для КБ-2в).

## References

- `prisma/schema.prisma:740-895` — ForemanReport*, як приклад attachments pattern
- `src/lib/firm/scope.ts` — multi-firm scoping
- `src/app/foreman/_components/*` — existing foreman PWA conventions
- `src/lib/pwa/` — SW v5.3.0 (підвищити до 5.4.0)
- Memory: `project_metrum_foreman_role` (kiosk PWA flow)
- Memory: `project_metrum_full_firm_isolation` (firm-isolation rules)
- Наказ Мінрегіону №65 — офіційний layout КБ-2в (потрібно отримати від користувача)
