# Beta Release Runbook

Operational checklist для запуску Closed Beta. Виконати у послідовності перед кожним production-релізом.

## 0. Pre-flight

- [ ] `git status` чистий, гілка зведена з `main`.
- [ ] Локально пройдено: `npm run typecheck && npm run lint && npm run test:unit`.
- [ ] Якщо змінювали Prisma schema — міграція згенерована проти **локальної throwaway-БД** (CLAUDE.md §БД).

## 1. CI gate

GitHub Actions [.github/workflows/ci.yml](../.github/workflows/ci.yml) має пройти:
- `typecheck` — 0 errors
- `lint` — 0 errors (warnings допустимі — React Compiler експериментальні rules)
- `test:unit` — усі suites green

Якщо CI red → не мерджити.

## 2. Smoke pack

Перший раз на машині:
```bash
npm run test:e2e:install   # завантажує Chromium ~200MB
```

Кожен release:
```bash
npm run db:seed-e2e        # idempotent seed: 8 ролей + project + supplier
npm run build && npm run start &
BASE_URL=http://localhost:3000 npm run test:e2e
```

Усі enabled тести у [e2e/smoke.spec.ts](../e2e/smoke.spec.ts) мають бути green. `test.skip` лишаються до того, як seed заповнить upstream-сутності (estimate, RFI, RFQ з валідним токеном).

## 3. ACL spot-check

Після кожної міграції routes:
```bash
npx tsx scripts/audit-acl-routes.ts
```

Перевірити [docs/ACL_AUDIT_MATRIX.md](ACL_AUDIT_MATRIX.md):
- ❌ OPEN → виправити перед merge.
- ⚠️ PARTIAL → допустимо, але новий PARTIAL вимагає manual review.

Ручний role pass (один раз на release):
- [ ] Login `e2e-super_admin` → бачить фінанси, AI chat, admin/health.
- [ ] Login `e2e-manager` → НЕ бачить ЗП у фінансах.
- [ ] Login `e2e-client` → бачить лише свої проєкти; API `/api/admin/purchase-requests` → 403.
- [ ] Login `e2e-foreman` → доступ лише до `/foreman/*` kiosk.

## 4. Password recovery

Запит → email → reset → новий пароль працює:
- [ ] `/forgot-password` приймає email і завжди повертає той самий confirmation.
- [ ] Лист доставлено (Resend dashboard).
- [ ] Reset link одноразовий: повторне використання → "недійсне".
- [ ] AuditLog містить `PASSWORD_RESET_REQUESTED` + `PASSWORD_RESET_COMPLETED`.

## 5. Procurement end-to-end

Manual smoke по golden path:
- [ ] Створити PR (`/admin-v2/projects/[id]` → "Створити заявку").
- [ ] PR → Send RFQ → постачальник отримав email.
- [ ] Supplier подає bid через public URL `/public/rfq/[token]`.
- [ ] Award best bid → winner + losers отримали emails.
- [ ] Confirm delivery (full) → у `/admin-v2/finance` зʼявився FACT EXPENSE.

## 6. Database migration

Production deploy:
- Railway main service `startCommand` має бути `npm run release:start`.
- Хук `release:start` chain: `deploy:check-env && deploy:migrate && start` — fail-fast.
- НЕ запускати `prisma migrate diff --shadow-database-url` проти будь-чого крім throwaway-БД (інцидент 2026-05-22).

## 7. Post-deploy verification

Після того як new deploy live:
- [ ] `/admin/health` як SUPER_ADMIN → "healthy", очікувані таблиці.
- [ ] `/admin-v2` як MANAGER → дашборд рендериться.
- [ ] Логи Railway без stack traces за 5 хв.
- [ ] Sentry / errors quiet.

## 8. Rollback

Якщо щось зламалося:
1. Railway → Deployments → попередній deploy → "Redeploy".
2. Якщо міграція пройшла, але код треба відкотити — додатково перевірити, чи нові колонки опціональні; інакше потрібен compensating migration.
3. Повідомити команду + зафіксувати інцидент у [docs/PRODUCTION_REVIEW.md](PRODUCTION_REVIEW.md).

## Довідка

- [BETA_READINESS_CHECKLIST.md](BETA_READINESS_CHECKLIST.md) — повний scope P0/P1/P2.
- [ACL_AUDIT_MATRIX.md](ACL_AUDIT_MATRIX.md) — стан routes (auto-generated).
- [CLAUDE.md](../CLAUDE.md) — multi-firm rule + забороннені DB команди.
