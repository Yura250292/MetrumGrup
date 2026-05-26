# Task 07 — RFI Management (Request for Information)

> Priority: 🟡 HIGH | Estimate: 2-3 тижні | Owner: ___

## Mission

Впровадити **RFI (Request for Information)** — структурований процес запитів інформації між підрядником, проєктантом і ГІП. Замінити хаос у Viber/Telegram на ведений реєстр з номерами, SLA, ескалаціями, реєстром для офіційного звіту замовнику.

RFI = офіційний документ "У нас на стройці виникло питання — потрібна відповідь від проєктанта/ГІП за X годин".

## Context

- **Stack:** Next.js 15 + Prisma + PostgreSQL + Tailwind v4.
- **Multi-firm:** усі RFI належать одному `firmId` (через `Project.firmId` → scope).
- **Notifications:** є існуючий `notifyUsers` (припускаємо в `src/lib/notifications/` або в `src/lib/bot/`) — використати для DM/@mentions.
- **Cron:** додати/використати існуючий cron framework. Якщо нема — `pg-boss` scheduled jobs або Vercel Cron / Railway cron service.
- **ChangeOrder:** припускаємо існує модель `ChangeOrder` (якщо ні — створити в окремій task). Інтеграція "RFI → ChangeOrder" — опційна.
- **Файлові вкладення:** Cloudflare R2, той самий upload helper що в task 06.

## Business Goal

- **100% офіційних запитів** до проєктанта оформлюються через систему (не Viber).
- Середній час відповіді на NORMAL RFI: **≤ 48 годин** (з ескалацією при перевищенні).
- Для замовника — кнопка "Експорт реєстру RFI" в Excel за 1 клік.
- Зменшення прострочених RFI на ≥50% за квартал після впровадження.

## Out of Scope

- Document Management повна структура (креслення з versioning) — окрема task. У rev.1 опційна привʼязка до `IncomingDocument` з task 06.
- Submittal Management (узгодження матеріальних подань) — окрема task.
- Auto-translate RFI (укр/англ) для іноземних проєктантів — окрема task.

## Prerequisites

- [ ] Task 06 (опційно) — щоб привʼязувати скани креслень/листів до RFI.
- [ ] Перевірити чи існує `ChangeOrder` модель; якщо ні — інтеграцію відкласти.
- [ ] Cron framework: підтвердити що використовуємо (pg-boss / external).
- [ ] `notifyUsers` API — перевірити signature і pluggability.

## 🚨 Parallel Conflicts

- `prisma/schema.prisma` — нові моделі `RFI`, `RFIAttachment`, `RFIComment` + enums.
- `src/app/admin-v2/projects/[id]/_components/` — нова вкладка `tab-rfis.tsx`. Конфлікт з будь-якою іншою таскою, що чіпає табс-конфіг проєктної сторінки.
- `src/lib/cron/` — нова cron job (якщо інша task додає свої).
- `src/lib/notifications/` — нові notification templates (RFI assigned / due-soon / overdue / answered).
- `src/app/admin-v2/_lib/nav.ts` — додати глобальний пункт "RFI" з badge `open + overdue` count.

## Data Model (Prisma)

```prisma
enum RFIStatus {
  OPEN
  IN_PROGRESS
  ANSWERED
  CLOSED
  CANCELLED
}

enum RFIPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model RFI {
  id              String      @id @default(cuid())
  firmId          String
  projectId       String
  /// Auto-generated per project: RFI-001, RFI-002, ...
  number          String

  subject         String
  question        String      @db.Text

  askedById       String
  askedAt         DateTime    @default(now())

  assignedToId    String?
  /// SLA deadline — обчислюється з priority + firm-settings при створенні.
  dueAt           DateTime?

  status          RFIStatus   @default(OPEN)
  priority        RFIPriority @default(NORMAL)

  answer          String?     @db.Text
  answeredById    String?
  answeredAt      DateTime?

  closedById      String?
  closedAt        DateTime?

  cancelledById   String?
  cancelledAt     DateTime?
  cancelReason    String?

  impactsSchedule Boolean     @default(false)
  impactsBudget   Boolean     @default(false)

  /// Прапор що відмітка ескалації вже надіслана (80% deadline).
  reminderSentAt  DateTime?
  /// Прапор фінальної ескалації (after deadline).
  escalatedAt     DateTime?

  /// Опційний звʼязок з ChangeOrder, створеним з цього RFI.
  changeOrderId   String?     @unique

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  firm            Firm        @relation(fields: [firmId], references: [id])
  project         Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  askedBy         User        @relation("RFIAsker", fields: [askedById], references: [id])
  assignedTo      User?       @relation("RFIAssignee", fields: [assignedToId], references: [id])
  answeredBy      User?       @relation("RFIAnswerer", fields: [answeredById], references: [id])
  closedBy        User?       @relation("RFICloser", fields: [closedById], references: [id])
  cancelledBy     User?       @relation("RFICanceller", fields: [cancelledById], references: [id])

  attachments     RFIAttachment[]
  comments        RFIComment[]

  @@unique([projectId, number])
  @@index([firmId, status])
  @@index([projectId, status])
  @@index([assignedToId, status])
  @@index([dueAt])
  @@map("rfis")
}

model RFIAttachment {
  id          String   @id @default(cuid())
  rfiId       String
  fileUrl     String   // R2
  fileName    String
  fileSize    Int
  mimeType    String
  uploadedById String
  uploadedAt  DateTime @default(now())
  /// "QUESTION" — додано до питання; "ANSWER" — до відповіді.
  context     String   @default("QUESTION")

  rfi         RFI      @relation(fields: [rfiId], references: [id], onDelete: Cascade)
  uploadedBy  User     @relation(fields: [uploadedById], references: [id])

  @@index([rfiId])
  @@map("rfi_attachments")
}

model RFIComment {
  id        String   @id @default(cuid())
  rfiId     String
  authorId  String
  body      String   @db.Text
  createdAt DateTime @default(now())

  rfi       RFI      @relation(fields: [rfiId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id])

  @@index([rfiId, createdAt])
  @@map("rfi_comments")
}

/// SLA конфіг на рівні фірми. Якщо запису нема — defaults: 72/48/24/8 годин.
model FirmRFISLA {
  id            String   @id @default(cuid())
  firmId        String   @unique
  hoursLow      Int      @default(72)
  hoursNormal   Int      @default(48)
  hoursHigh     Int      @default(24)
  hoursUrgent   Int      @default(8)
  updatedAt     DateTime @updatedAt

  firm          Firm     @relation(fields: [firmId], references: [id])

  @@map("firm_rfi_sla")
}
```

## Migration Strategy

1. Локальна одноразова БД → `prisma migrate dev --name add_rfi --create-only`.
2. Перенести SQL у `prisma/migrations/<ts>_add_rfi/migration.sql`.
3. Seed default `FirmRFISLA` для двох фірм у seeder.
4. Запустити `prisma migrate deploy` на staging → prod.

## Atomic numbering (RFI-001 per project)

```typescript
// src/lib/rfi/numbering.ts
export async function nextRFINumber(tx: PrismaTransactionClient, projectId: string): Promise<string> {
  const count = await tx.rFI.count({ where: { projectId } });
  // Можливі race conditions при паралельному створенні → робити це
  // в SERIALIZABLE транзакції або через SELECT FOR UPDATE на парент-Project.
  return `RFI-${String(count + 1).padStart(3, "0")}`;
}
```

**Правильніше:** додати `Project.rfiCounter Int @default(0)` і atomic increment:
```typescript
const project = await tx.project.update({
  where: { id: projectId },
  data: { rfiCounter: { increment: 1 } },
});
return `RFI-${String(project.rfiCounter).padStart(3, "0")}`;
```
→ atomic на рівні row lock. Цей варіант — обрано.

## SLA & Escalation Engine

- При створенні RFI: `dueAt = askedAt + firmSLA[priority] hours`.
- Cron job щогодини: `src/lib/cron/rfi-escalation.ts`.
  - Для RFI зі статусом `OPEN | IN_PROGRESS`:
    - Якщо `now ≥ askedAt + 0.8 * (dueAt - askedAt)` і `reminderSentAt IS NULL` → notify `assignedTo` + ставимо `reminderSentAt`.
    - Якщо `now ≥ dueAt` і `escalatedAt IS NULL` → notify `Project.managerId` + `assignedTo` (escalate) + `escalatedAt = now()`.
- Stop conditions: status → `ANSWERED | CLOSED | CANCELLED` → cron ігнорує.

## API Endpoints

| Method | Path | Призначення |
|---|---|---|
| GET    | `/api/admin/rfis` | global list з фільтрами (firmId scope) |
| GET    | `/api/admin/projects/:projectId/rfis` | per-project list |
| POST   | `/api/admin/projects/:projectId/rfis` | створити RFI (atomic numbering) |
| GET    | `/api/admin/rfis/:id` | повний RFI + comments + attachments |
| PATCH  | `/api/admin/rfis/:id` | update subject/question/priority/assigned (тільки OPEN/IN_PROGRESS) |
| POST   | `/api/admin/rfis/:id/answer` | відповідь + status=ANSWERED |
| POST   | `/api/admin/rfis/:id/close` | status=CLOSED (тільки після ANSWERED або з cancel reason) |
| POST   | `/api/admin/rfis/:id/cancel` | status=CANCELLED + reason |
| POST   | `/api/admin/rfis/:id/comments` | додати уточнення/обговорення |
| POST   | `/api/admin/rfis/:id/attachments` | upload до R2 |
| DELETE | `/api/admin/rfis/:id/attachments/:attId` | видалити (лише власник або PM) |
| POST   | `/api/admin/rfis/:id/create-change-order` | спрямувати в ChangeOrder, set `changeOrderId` (якщо `impactsBudget=true`) |
| GET    | `/api/admin/projects/:projectId/rfis/export.xlsx` | реєстр в Excel |
| GET    | `/api/admin/firms/:firmId/rfi-sla` | прочитати SLA settings |
| PATCH  | `/api/admin/firms/:firmId/rfi-sla` | оновити SLA (тільки SUPER_ADMIN) |

### RBAC

- Create: будь-яка роль крім CLIENT (CLIENT створює окремий тип запиту).
- Update / answer: assignedTo або SUPER_ADMIN / MANAGER на проєкті.
- Close: askedBy або assignedTo або PM.
- Cancel: askedBy або SUPER_ADMIN.
- View: усі члени проєкту того ж firmId.

## UI Changes

- `src/app/admin-v2/projects/[id]/_components/tab-rfis.tsx` — **нова вкладка** в проєкті.
  - Toggle: Kanban (OPEN / IN_PROGRESS / ANSWERED / CLOSED) ⇄ Table.
  - Filters: assignee, priority, overdue, has-attachments.
  - Кожна картка: number, subject, priority badge, due countdown (red if <24h), assignee avatar, attachments icon.
- `src/app/admin-v2/projects/[id]/_components/rfi-drawer.tsx` — створення/редагування у drawer.
  - Поля: subject, question (markdown editor), assignedTo, priority, dueAt (auto-calc, можна override), impactsSchedule, impactsBudget, attachments drag-drop.
- `src/app/admin-v2/projects/[id]/_components/rfi-thread.tsx` — детальний view (всередині drawer): питання + attachments + comments thread + answer composer (для assignee) + статус-actions.
- `src/app/admin-v2/rfis/page.tsx` — global RFI dashboard (across projects).
  - "My assigned (overdue)" / "My asked" / "All firm overdue".
- `src/app/admin-v2/_lib/nav.ts` — пункт "RFI" з badge `count(status=OPEN AND now>dueAt)`.
- `src/app/admin-v2/settings/firm/rfi-sla/page.tsx` — налаштування SLA (SUPER_ADMIN).

## Implementation Plan

1. [ ] Створити enums + моделі у `prisma/schema.prisma` + `Project.rfiCounter`.
2. [ ] Згенерувати міграцію на throwaway-БД.
3. [ ] Seed `FirmRFISLA` defaults для metrum-group і metrum-studio.
4. [ ] `src/lib/rfi/numbering.ts` — atomic increment via `Project.rfiCounter`.
5. [ ] `src/lib/rfi/sla.ts` — compute `dueAt` з priority + firm SLA.
6. [ ] API: POST/GET/PATCH RFI з firmId scope check (`resolveFirmScope`).
7. [ ] API: answer / close / cancel.
8. [ ] API: comments + attachments (R2 upload).
9. [ ] `src/lib/cron/rfi-escalation.ts` — реалізація + регістрація в cron runner.
10. [ ] Notifications templates: RFI_ASSIGNED, RFI_DUE_SOON, RFI_OVERDUE, RFI_ANSWERED, RFI_COMMENT, RFI_CLOSED.
11. [ ] UI: tab-rfis (kanban + table).
12. [ ] UI: drawer create/edit + thread.
13. [ ] UI: global dashboard.
14. [ ] Excel export з `exceljs` (адекватний форматтінг — number, subject, status, priority, asked/answered dates, days_open).
15. [ ] UI: SLA settings page.
16. [ ] Інтеграція "Create ChangeOrder from RFI" (якщо ChangeOrder існує).
17. [ ] Tests (див. нижче).
18. [ ] Документація користувача: `docs/operations/rfi-guide.md`.

## Acceptance Criteria

- [ ] Створення RFI у проєкті A не впливає на нумерацію проєкту B (per-project counter).
- [ ] Atomic numbering: 10 паралельних POST → 10 унікальних номерів без дублів.
- [ ] При priority=URGENT `dueAt = askedAt + 8h` (за дефолтним SLA).
- [ ] Зміна SLA settings → діє ТІЛЬКИ на нові RFI (існуючі не перераховуються).
- [ ] Cron job correctly посилає reminder на 80% і escalate після deadline (single-shot — повторно не шле).
- [ ] Excel export містить усі поля + Cyrillic UTF-8 коректно відображається.
- [ ] CLIENT user не бачить RFI вкладки (RBAC).
- [ ] Studio user НЕ бачить Group RFIs.
- [ ] Status transitions enforced: не можна CLOSED → ANSWERED; CANCELLED фінальний.
- [ ] Attachment max size 25 MB, валідація на API.
- [ ] Drawer відкривається <300ms (lazy-loaded).
- [ ] Badge у nav оновлюється real-time (або polling 60s).

## Testing

- **Unit:**
  - `nextRFINumber()` — race condition simulation (10 паралельних `Promise.all` → unique).
  - `computeDueAt(priority, askedAt, sla)` — boundary values, DST.
  - SLA reminder logic (80% threshold) — edge cases.
  - RBAC: matrix per status × role × action.
- **Integration:**
  - End-to-end create → assign → comment → answer → close.
  - Cron escalation: підтвердити що notification fired, прапори встановлені, повторно не шле.
  - Cancel → не дозволяє reopen.
  - Excel export байт-точність на fixture.
- **Manual:**
  - Перевірити в UI що kanban drag-drop працює (якщо реалізуємо drag-drop між колонками = update status).
  - Mobile responsive на drawer.
  - Notification приходить у Telegram bot.

## Open Questions

- [ ] Drag-drop статусів у kanban: дозволити чи лишити кнопки-actions у деталях? (drag-drop може спричиняти випадкове закриття).
- [ ] Чи мають CLIENT бачити RFI що `impactsBudget=true` (бо це їхній бюджет)? Pro: прозорість. Cons: внутрішня кухня.
- [ ] SLA — у годинах календарних чи робочих (з урахуванням вихідних)? Рекомендація: календарні в rev.1, robochi-godyny у rev.2.
- [ ] Auto-asignment: чи робити правила (наприклад "усі RFI з тегом ELECTRICAL → інженер Х")? Відкласти на v2.
- [ ] Email-нотифікації крім in-app/bot — потрібні? (для зовнішніх проєктантів, які не мають акаунту Metrum). Потенційно — magic-link на answer без логіну.
- [ ] Інтеграція з Document Management (task 06): RFI може посилатися на конкретне креслення з ревізією. У scope rev.1 — лише attachments; реф на креслення — пізніше.
- [ ] Чи дозволяти assigned user reassign до іншого? (Так, з reason + audit log.)

## References

- `prisma/schema.prisma` — `Project` (треба додати `rfiCounter`), `User`, `Firm`.
- `src/lib/firm/scope.ts` — `resolveFirmScope`.
- `src/lib/notifications/` (або `src/lib/bot/`) — `notifyUsers` API.
- `src/lib/auth.ts` — `requireRole`.
- Task 06 — для attachments через єдиний flow.
- ChangeOrder integration — координація з власником фінансового модуля.
- Excel export: <https://github.com/exceljs/exceljs>
- BIM Track / Procore як референс UX kanban для RFI.
