# Beta Staging Acceptance Pass

Чек-листи для трьох ролей, які мають "підписати" реліз перед запуском Closed Beta. Кожен чек-лист — це **не** покриття всього функціоналу, а саме критичні точки, які можуть зламатись між local dev і staging environment.

> Audit reference: BETA_GAPS_AUDIT.md §6.3.

---

## A. Dev (engineering) — підтвердити що деплой стабільний

Запускається на **staging URL** після `main → staging` deploy.

### A.1 Збірка і базові health-checks

- [ ] `https://staging.metrum-group.com.ua/` (або відповідний URL) повертає 200
- [ ] `/api/health` (якщо є) — 200 і свіжий timestamp
- [ ] У Railway/Vercel logs нема `[error]` за останні 5 хв після deploy
- [ ] `prisma migrate deploy` пройшло без `applied: 0 migrations` коли мали б бути нові
- [ ] R2 client healthy: завантаження тестового PNG через `/api/upload` повертає public URL

### A.2 Auth + permissions

- [ ] Login як SUPER_ADMIN, MANAGER, FINANCIER, ENGINEER, HR, FOREMAN, CLIENT — кожен потрапляє у свій home (`/admin-v2` для admin-ролей, `/dashboard` для CLIENT, `/foreman` для FOREMAN)
- [ ] `forgot-password` для існуючого юзера → email приходить → reset токен валідний
- [ ] CLIENT user НЕ може відкрити `/admin-v2/projects` (redirect до `/dashboard`)
- [ ] Studio MANAGER НЕ бачить Group-проєктів у `/admin-v2/projects`

### A.3 Background workers

- [ ] Telegram bot (`bot:dev`) піднімається (якщо включений у staging)
- [ ] RFI reminder cron (`/api/cron/rfi-reminders` або аналог) — `vercel.json` / `railway.json` cron-jobs визначені
- [ ] AI worker не зависає при OCR на тестовому PDF

### A.4 Не зломано регресію

- [ ] `npm run typecheck` локально на staging branch — green
- [ ] `npm run lint` — 0 errors (warnings можуть лишатись)
- [ ] `npm run test:unit && npm run test:components` — green
- [ ] `npm run test:e2e` проти staging (з `BASE_URL=<staging>`) — green
- [ ] Останні 5 PR не відкочують жодну з функцій з `BETA_MODULE_CHECKLIST.md` ✅

---

## B. QA (product quality) — пройти руками 11 core journeys

Працює як **SUPER_ADMIN** на staging із seeded test data (`npm run db:seed-e2e` проти staging DB).

### B.1 Auth flows

1. [ ] **Login** — `staging.metrum-group.com.ua/login` → e2e-super_admin@... → редирект `/admin-v2`
2. [ ] **Forgot password** — e2e-manager@... → отримати email → відкрити reset link → задати новий пароль → залогінитись

### B.2 Project lifecycle

3. [ ] **Create project** — `/admin-v2/projects/new`, заповнити форму (title, client, manager) → submit → відкривається `[id]` сторінка
4. [ ] **Open project detail** — відкрити створений проєкт, переключитись між табами (Overview, Estimates, RFI, Change Orders, Documents, Payments, Photos, Team)

### B.3 Estimates

5. [ ] **Create estimate (manual)** — на проєкті, табл "Estimates" → "Створити вручну" → форма → submit
6. [ ] **Open estimate details** — клік по створеному кошторису → відкривається `[id]` сторінка з items + sum
7. [ ] **Search кошторисів** (нове в Beta) — на `/admin-v2/estimates` ввести фрагмент title → список фільтрується. Очистити query → весь список.

### B.4 Financing

8. [ ] **Add finance entry** — як SUPER_ADMIN, `/admin-v2/financing/new` → DRAFT entry → submit → з'являється у списку
9. [ ] **Edit finance entry** — клік по entry → inline edit поля Сума → save → KPI strip оновлюється
10. [ ] **RBAC check** — залогінитись як MANAGER → НЕ бачить цифр у `/admin-v2/financing/*` (фільтр через `canViewFinance()`)

### B.5 Receipts (OCR)

11. [ ] **Upload receipt** — `/admin-v2/documents/inbox` → drag-drop PDF → з'являється у списку зі статусом `PROCESSING` → за ~30s переходить у `PARSED`
12. [ ] **Review parsed receipt** — клік на документ → drawer показує AI-fields, можна редагувати, "Привʼязати до FinanceEntry" → новий FinanceEntry створюється

### B.6 Counterparties

13. [ ] **Counterparty dossier** — `/admin-v2/counterparties` → клік на existing → відкривається `[id]` сторінка з payment history + documents

### B.7 RFI

14. [ ] **Create RFI** — `/admin-v2/projects/[id]` → таб "RFI" → "+ Новий" → форма → submit
15. [ ] **Answer + close RFI** — на тому ж RFI: open drawer → ввести відповідь → "Submit answer" → status `ANSWERED` → "Close" → status `CLOSED`

### B.8 Change Order

16. [ ] **Create change order** — `/admin-v2/change-orders/new` → форма (project, type, title, items, cost+schedule impact) → save як DRAFT
17. [ ] **Submit for approval** — на CO drawer "Send to PM" → status `PENDING_PM`

### B.9 Multi-firm isolation

18. [ ] Login як Studio MANAGER (e2e-studio-manager@...) → у списку проєктів видно ТІЛЬКИ Studio-проєкти; не видно Group
19. [ ] Створити проєкт як Studio MANAGER → `firmId="metrum-studio"` на запису (перевір через `db:studio`)

### B.10 Procurement (BETA scope)

20. [ ] **Full procurement cycle** — PR → RFQ → public bid submit (через окремий браузер без логіну) → award → PO → confirm delivery → перевірити `FinanceEntry(source=PURCHASE_ORDER)` створено

Якщо хоч один пункт ❌ — staging-pass провалений, ескалація до dev і блок Beta-launch.

---

## C. Product / operations — підтвердити що Beta-користувач не застрягне

Працює як **MANAGER без знання внутрішки**, на тих же staging URL.

### C.1 Перше враження (0-30 секунд)

- [ ] Після login видно welcome / dashboard з очевидним наступним кроком
- [ ] У бічному меню всі активні модулі мають іконки + лейбли; BETA-модулі промарковані бейджем
- [ ] Перший раз клік на `/admin-v2/projects` (empty state) — є кнопка "Створити проєкт" з прикладом

### C.2 Empty states (нові в Beta)

- [ ] `/admin-v2/counterparties` (empty) — bachit EmptyState з CTA "Додати контрагента" і "Імпорт з Excel"
- [ ] `/admin-v2/rfis` (empty) — bachit EmptyState з підказкою "RFI створюються в проєкті" і CTA "Перейти до проєктів"
- [ ] `/admin-v2/change-orders` (empty) — bachit EmptyState з CTA "Створити дод. угоду"
- [ ] `/admin-v2/documents/inbox` (empty) — bachit EmptyState з CTA "Завантажити документ"
- [ ] `/admin-v2/estimates` — пошук працює (введи 2 символи → список фільтрується). Empty search показує "Нічого не знайдено" + "Очистити пошук" кнопку.

### C.3 Errors і помилки видимі для юзера

- [ ] Випадкова сесія expire (manually clear cookie) → юзер бачить redirect на `/login`, не "500"
- [ ] Завантажити .exe як receipt → інформативна помилка з MIME-валідації, не stack trace
- [ ] Надсилання форми без required field → inline-помилка біля поля + focus на поле

### C.4 Communication / контакти

- [ ] У footer / settings є контакт support (email)
- [ ] Якщо проект сезонний — privacy/terms посилання валідні
- [ ] Help-drawer (`?` кнопка) відкривається на кожній admin-v2 сторінці

### C.5 Документація

- [ ] [BETA_MODULE_CHECKLIST.md](./BETA_MODULE_CHECKLIST.md) актуальний — відображає реальну реальність на staging
- [ ] [PROCUREMENT_BETA_NOTES.md](./PROCUREMENT_BETA_NOTES.md) — постачальникам зрозуміло що Phase B
- [ ] [BETA_SUPPORT_RUNBOOKS.md](./BETA_SUPPORT_RUNBOOKS.md) — operations команда знає де шукати recipe

---

## D. Sign-off

Коли всі три (A + B + C) зелені:

- Створити tag `beta-launch-YYYY-MM-DD` від commit на staging
- Закомітити цей файл з відмітками `[x]` де пройдено + дата
- PR-меседж: "Closed Beta acceptance pass — A/B/C signed off by @<dev> / @<qa> / @<product>"
- Включити Beta flag (якщо feature-flagged) або задеплоїти на prod
