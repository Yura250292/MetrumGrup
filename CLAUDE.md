# Metrum Group — quick context for Claude

Full-stack monolith: marketing site + admin/CRM/ERP + client dashboard + AI estimates + finance + foreman PWA + Telegram bot.

## Stack

- Next.js (App Router) + React 19 + TypeScript + Tailwind v4
- Prisma + PostgreSQL (Railway), Cloudflare R2 for files
- Auth: next-auth (`src/lib/auth.ts`)
- AI: Anthropic + Gemini + AssemblyAI + ElevenLabs
- Tests: Jest (`src/lib/**/__tests__/*.test.ts`)

## Commands

- `npm run dev` — Next dev (turbopack)
- `npm run build` — prisma generate + next build
- `npm run typecheck` — must pass before commit
- `npm test` / `npm run test:unit` / `npm run test:components`
- `npm run db:push` / `db:seed` / `db:studio`
- `npm run bot:dev` — Telegram bot (separate process)

## Key directories

- `src/app/admin-v2/*` — canonical admin UI (use this)
- `src/app/dashboard/*` — client portal
- `src/app/foreman/*` — kiosk PWA for виконробів
- `src/app/api/*` — server routes
- `src/lib/firm/` — multi-tenant scope (Group vs Studio)
- `src/lib/foreman/` — supplier resolution + report merge
- `src/lib/financing/` — KB2, cashflow, budget matrix, RBAC
- `src/lib/ai/`, `src/lib/estimates/` — AI estimate pipeline
- `prisma/schema.prisma` — domain truth

## Multi-firm rule (CRITICAL)

Two firms: `metrum-group` and `metrum-studio`. **Дані повністю ізольовані** (HR, контрагенти, чати, AI, ставки). Спільне ТІЛЬКИ: `PortfolioProject`, `NewsArticle`, `Page` (маркетинг-сайт).

Усі агрегації мають іти через `resolveFirmScope` з `src/lib/firm/scope.ts`. Studio директор = `MANAGER` з `firmId="metrum-studio"`. Тести: `src/lib/firm/__tests__/scope.test.ts`.

## Foreman flow

Текст/фото/PDF/Excel → AI-парс → `ForemanReport(DRAFT)` → manager approve → `FinanceEntry(kind=FACT, source=FOREMAN_REPORT)`. API: `src/app/api/foreman/reports/`.

## DO NOT touch without coordination

- `src/app/admin/*` (legacy) — `/admin/finance/*` і `/admin/estimates/*` мають паралельну інтеграцію. Не полірувати `AdminSidebar/Header/MobileNav` — це shell для legacy.
- AI кошториси (`src/lib/estimates/`, `src/app/ai-estimate-v2/`) — команда щойно завершила роботу. Чіпати тільки за прямим запитом.
- Financing pivot/KB2 — складні інваріанти, прикриті тестами в `financing/__tests__`. Будь-які зміни — спершу запустити `npm run test:unit`.

## Безпека

- Не покладатись на UI/redirect для ACL. Завжди явні role+ownership перевірки в API.
- Studio user не повинен бачити Group дані — перевіряй `firmId` фільтр.

## Глибший контекст

- `AGENTS.md` — більше деталей (deployment, зони, runtime)
- `ARCHITECTURE_FOR_CLAUDE.md` — повна архітектура
- `PRODUCTION_REVIEW.md` — відомі production-ризики

## Ще ~50 .md у корені

Більшість — застарілі плани/рев'ю. Не читай їх крім випадків коли явно потрібно. Source of truth — код + цей файл + `AGENTS.md`.
