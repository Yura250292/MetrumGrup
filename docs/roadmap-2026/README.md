# Metrum Roadmap 2026 — Task Files for Parallel Execution

> Папка з task-файлами для **паралельного виконання різними Claude-чатами**. Кожен .md — самодостатня фіча з повним контекстом всередині.

---

## Як працювати

1. **Один файл = один Claude-чат = одна фіча.**
2. Відкрий потрібний `NN-feature-name.md` → скопіюй увесь вміст → встав у новий Claude-чат → напиши `"Виконай цей task. Шлях проєкту: /Users/admin/Igor-Shiba/metrum-group/"`.
3. Файли self-contained: stack, шляхи, моделі, API, acceptance — все всередині. Чат не потребує читати інші файли крім тих, що явно вказані в `References`.
4. **Кожен task завершується commit-ом міграції** перед стартом наступного — інакше конфлікт на `prisma/schema.prisma`.

---

## 🎨 ОБОВ'ЯЗКОВЕ ПРОЧИТАННЯ ДЛЯ ВСІХ ЧАТІВ

**Перед будь-яким task'ом 01-15 — прочитати `00-ux-pattern-drilldown-drawer.md`.**

Це cross-cutting UI-контракт: усі деталі сутностей (Counterparty, ChangeOrder, Equipment, RFI, Document, Task, Incident, ...) відкриваються в **єдиному drill-down drawer справа** з Notion-style stack-навігацією (peek mode + breadcrumb + ESC=back). Кожен модуль ОБОВ'ЯЗКОВО додає свій `DrawerContent`-renderer і реєструє в `DRAWER_REGISTRY` — без винятків.

> **Серіалізація:** Phase 1 + Phase 2 з `00-ux-pattern-drilldown-drawer.md` (foundation + міграція існуючого Task drawer) виконати **ДО** старту будь-якого модульного task'у з 01-15. Інакше кожен модуль напише свій варіант → доведеться переписувати.

---

## 🚦 Карта пріоритетів

| №  | Назва                              | Пріоритет     | Естімейт   | Залежності       |
| -- | ---------------------------------- | ------------- | ---------- | ---------------- |
| 01 | Cost Codes / WBS                   | 🔴 MUST-HAVE  | 4–6 тижнів | —                |
| 02 | Change Orders / Дод. угоди         | 🔴 MUST-HAVE  | 3–4 тижні  | **01**           |
| 03 | Foreman Mobile UX v2 (offline)     | 🔴 MUST-HAVE  | 3 тижні    | —                |
| 04 | Equipment Register (повний)        | 🟡 SHOULD     | 2–3 тижні  | — (модель є)     |
| 05 | Critical Path + Gantt v2           | 🟡 SHOULD     | 4 тижні    | —                |
| 06 | Subcontractor Portal               | 🟡 SHOULD     | 3 тижні    | 01, 03           |
| 07 | Document Builder (акти/КБ-2/КБ-3)  | 🔴 MUST-HAVE  | 3 тижні    | 01               |
| 08 | Procurement / Tenders              | 🟢 NICE       | 4 тижні    | 01               |
| 09 | Counterparty 360 (КЯС, історія)    | 🟡 SHOULD     | 2 тижні    | 01               |
| 10 | Payroll Allocation by Cost Code    | 🔴 MUST-HAVE  | 2 тижні    | 01, 03           |
| 11 | RBAC Finance — розширений          | 🔴 MUST-HAVE  | 1 тиждень  | —                |
| 12 | AI Project Health Score            | 🟢 NICE       | 3 тижні    | 01, 05, 10       |

**Легенда:** 🔴 без цього ERP неповноцінний / 🟡 значно покращує цінність / 🟢 nice-to-have

---

## ⚠️ ПАРАЛЕЛЬНЕ ВИКОНАННЯ — правила безпеки

### 1. Конфлікти на `prisma/schema.prisma`

**ВСІ task-и редагують `prisma/schema.prisma`.** Міграції — **строго послідовно**:

```
chat-A закінчив → коміт міграції в main
   ↓
chat-B робить `git pull` + `npx prisma migrate dev` від HEAD
   ↓
chat-B закінчив → коміт → chat-C ...
```

Якщо два чати одночасно зробили `prisma migrate dev` — отримаєш конфлікт у `prisma/migrations/`. Розрулюй вручну:

```bash
# у відстаючого чату:
git pull
rm -rf prisma/migrations/<свою-нову-папку>
npx prisma migrate dev --name <своя-назва-зі-суфіксом-2>
```

🚨 **ЗАБОРОНЕНО** (з MEMORY): `migrate reset`, `db push --force-reset`, `--accept-data-loss`. Безпечно: `migrate deploy`, `migrate dev`, `db push` без прапорів.

### 2. Конфлікти по файлах (матриця)

| Файл / модель                                     | Task-и що редагують               | Conflict risk      |
| ------------------------------------------------- | --------------------------------- | ------------------ |
| `prisma/schema.prisma`                            | **усі**                           | 🔴 серіалізувати   |
| `src/app/admin-v2/_lib/nav.ts`                    | 01, 02, 03, 04, 05, 07, 08, 09, 12 | 🔴 серіалізувати   |
| `FinanceEntry` model                              | 01, 02, 06, 10                    | 🟡 узгодити схему  |
| `ForemanReport` / `ForemanReportItem`             | 03, 06, 10                        | 🟡 узгодити        |
| `Counterparty` model                              | 06, 08, 09                        | 🟡 узгодити        |
| `Task` model                                      | 02, 05                            | 🟡 узгодити        |
| `src/lib/firm/resolveFirmScope.ts`                | усі (тільки read)                 | 🟢 безпечно        |
| `src/app/admin-v2/projects/[id]/page.tsx`         | 02, 05, 07                        | 🟡 узгодити tabs   |
| `src/lib/ai-assistant/`                           | 02, 12                            | 🟢 додавання нових файлів |
| `next.config.ts`                                  | 03 (PWA), 06 (subdomain)          | 🟡 узгодити        |

**Правило:** якщо два task-и в одному рядку матриці — другий чекає, поки перший зробить commit + push.

### 3. Залежності (граф)

```
01 (Cost Codes)
 ├── 02 (Change Orders)
 ├── 06 (Subcontractor Portal)
 ├── 07 (Document Builder)
 ├── 08 (Procurement)
 ├── 09 (Counterparty 360)
 ├── 10 (Payroll Allocation)  ← також залежить від 03
 └── 12 (AI Health Score)     ← також 05, 10

03 (Foreman v2)
 ├── 06 (Subcontractor)
 └── 10 (Payroll)

05 (Gantt v2) → 12
04, 11 — незалежні
```

---

## 🎯 Рекомендований порядок запуску

### Спрінт 1 — фундамент (паралельно 3 чати, 1 тиждень overlap)
- **01** Cost Codes (старт першим, бо blocker)
- **04** Equipment Register (незалежний)
- **11** RBAC Finance (незалежний, маленький)

### Спрінт 2 — основні модулі (3 чати після завершення 01)
- **02** Change Orders
- **03** Foreman Mobile v2
- **07** Document Builder

### Спрінт 3 — розширення (3 чати)
- **05** Gantt v2
- **09** Counterparty 360
- **10** Payroll Allocation (після 03)

### Спрінт 4 — додаткове (2 чати)
- **06** Subcontractor Portal
- **08** Procurement

### Спрінт 5 — AI (1 чат)
- **12** AI Project Health Score

---

## 📋 Шаблон task-файлу

Кожен `NN-feature.md` має такі секції:

| Секція                  | Призначення                                                |
| ----------------------- | ---------------------------------------------------------- |
| **Mission**             | 1 параграф для нового Claude-чату — що буде робити         |
| **Context**             | Stack, шляхи, multi-firm нагадування — копія quick-context |
| **Business Goal**       | Чому це треба, метрика успіху                              |
| **Out of Scope**        | Що НЕ робити, щоб не розповзалося                          |
| **Prerequisites**       | Залежні task-и + питання до користувача                    |
| **🚨 Parallel Conflicts** | Файли/моделі що чіпає → з ким серіалізувати              |
| **Data Model (Prisma)** | Готовий код у ```prisma блоці                              |
| **Migration Strategy**  | Як накатувати на існуючі дані поетапно                     |
| **API Endpoints**       | Verb + path + body + response + handler signatures         |
| **UI Changes**          | Нові + змінені файли з описом                              |
| **Implementation Plan** | 15–20 кроків як чек-ліст                                   |
| **Acceptance Criteria** | 5–8 вимірюваних критеріїв                                  |
| **Testing**             | Unit / Integration / Manual                                |
| **Open Questions**      | Що уточнити у користувача перед стартом                    |
| **References**          | Доки, файли проєкту, зовнішні стандарти                    |

---

## 📦 Quick-context (копія в кожному task-файлі)

**Шлях:** `/Users/admin/Igor-Shiba/metrum-group/`
**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Prisma + PostgreSQL (Railway), Cloudflare R2, next-auth, Anthropic + Gemini + AssemblyAI + ElevenLabs, Jest.
**Канонічна UI:** `src/app/admin-v2/*` (НЕ `/admin/*` — це legacy redirect).
**Multi-firm:** firmId ∈ {`metrum-group`, `metrum-studio`}. Кожен query — через `resolveFirmScope` з `src/lib/firm/`. Дані ізольовані ПОВНІСТЮ, спільне ТІЛЬКИ: `PortfolioProject`, `NewsArticle`, `Page`.
**RBAC:** SUPER_ADMIN, MANAGER, HR, FINANCIER, ENGINEER, FOREMAN, CLIENT. Фінансові цифри (зарплати) — ТІЛЬКИ SUPER_ADMIN (через `canViewFinance()`).
**Foreman flow:** Text/photo/PDF/Excel → AI parse → `ForemanReport(DRAFT)` → manager approve → `FinanceEntry(kind=FACT, source=FOREMAN_REPORT)`.
**Тести:** `src/lib/**/__tests__/*.test.ts` + `npm run test:unit`.
**Entry docs:** `/Users/admin/Igor-Shiba/metrum-group/CLAUDE.md`, `AGENTS.md` (~50 інших .md у корені — застарілі, ігнорувати).

---

## 📁 Файли у цій папці

- `README.md` — цей файл
- `01-cost-codes-wbs.md` — Task 01 (готовий)
- `02-change-orders.md` — Task 02 (готовий)
- `03-foreman-mobile-v2.md` — TBD
- `04-equipment-register.md` — TBD
- `05-critical-path-gantt.md` — TBD
- `06-subcontractor-portal.md` — TBD
- `07-document-builder.md` — TBD
- `08-procurement-tenders.md` — TBD
- `09-counterparty-360.md` — TBD
- `10-payroll-allocation.md` — TBD
- `11-rbac-finance-extended.md` — TBD
- `12-ai-project-health.md` — TBD
