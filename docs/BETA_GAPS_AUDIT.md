# Beta Gaps Audit — що потрібно допрацювати

## 1. Мета

Цей файл фіксує, **що саме ще потрібно доробити** після технічної перевірки, щоб продукт можна було вважати готовим до `Closed Beta`.

Документ не повторює загальні плани. Це саме аудит недопрацьованих місць:

- що вже добре;
- що ще не підтверджено;
- що треба доробити обов'язково;
- що бажано доробити перед Beta;
- які модулі поки що не можна вважати повністю готовими.

---

## 2. Короткий висновок

Система **не виглядає сирою**. Ядро вже сильне:

- `Projects`
- `Estimates`
- `Financing`
- `Counterparties / SRM`
- `Receipts / Documents`
- `RFI`
- `Change Orders`

Але після перевірки **не можна чесно сказати, що все вже готово до Beta без застережень**.

Причини:

1. повна готовність не підтверджена через відсутність завершеної end-to-end верифікації;
2. `lint` більше не падає, але лишається дуже багато warning-level ризиків;
3. у коді ще є місця з явною ознакою незавершеного UX або `Phase B`;
4. частина workflow ще не замкнена в повний користувацький цикл;
5. окремі модулі самі промарковані як `BETA`.

---

## 3. Що вже виглядає добре

### 3.1. Формальні технічні сигнали

- робоче дерево чисте;
- `typecheck` проходить;
- `lint` більше не падає по errors;
- новий help-layer структурно підключений правильно через `HelpProvider`, `HelpDrawer`, `HelpButton`;
- `forgot password / reset password` flow уже реалізований як реальний backend flow, а не заглушка.

### 3.2. Архітектурно сильні сторони

- великий домен у Prisma;
- рольова модель уже вбудована в більшість нових модулів;
- `admin-v2` став основним shell;
- є міграції, тести, audit, multi-firm logic;
- є SRM, RFI, receipts, change orders, supplier-related finance контури.

---

## 4. Що ще не готово або не підтверджено

## 4.1. Не завершена повна верифікація runtime-ready стану

Під час перевірки не було підтверджено до кінця:

- повний `npm run build`
- повний прохід unit suite
- browser-level сценарне проходження ключових екранів

Це означає:

- не можна стверджувати, що всі кнопки реально натискаються коректно;
- не можна гарантувати, що немає runtime-помилок у важких user journeys;
- не можна підтвердити, що вся структура релізно стабільна.

### Що доробити

1. Дочекатися повного `build` і зафіксувати результат.
2. Прогнати повний unit suite і зафіксувати падіння, якщо вони є.
3. Пройти browser-level smoke scenarios на staging або локальному dev server.

---

## 4.2. Warning-level технічний борг ще занадто великий

Хоча `lint` уже не red, залишаються сотні warnings. Не всі з них критичні, але частина сигналізує не про стиль, а про **ризик крихкої логіки**.

Приклад:

- [use-dashboard-layout.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/dashboard/use-dashboard-layout.ts:213)

Там є оновлення `ref` під час render:

```ts
fnRef.current = fn;
```

Це не обов'язково миттєвий баг, але це не бажаний production-grade патерн перед Beta.

### Що доробити

1. Виділити warnings на 3 групи:
   - косметичні
   - технічний борг
   - логічно небезпечні
2. Пріоритетно прибрати warnings, пов'язані з:
   - React hooks
   - refs during render
   - missing deps
   - setState / render lifecycle misuse
3. Заморозити нові warning-level патерни на core Beta modules.

---

## 4.3. Не всі користувацькі сценарії завершені в UX

У коді ще є явні сигнали, що частина сторінок або можливостей не доведена до повноцінного user-facing стану.

Приклад:

- [estimates/page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/estimates/page.tsx:136)

Там прямо рендериться:

- `Пошук скоро з'явиться`

Це означає, що навіть у core-модулі ще є недороблені interaction points.

### Що доробити

1. Пройти всі core Beta pages і знайти:
   - `coming soon`
   - тимчасові placeholder-и
   - пусті CTA без завершеного flow
2. Для кожної:
   - або доробити функцію;
   - або прибрати/приховати з Beta;
   - або явно позначити як internal-only.

---

## 4.4. Document workflow ще не завершений як універсальний контур

Приклад:

- [documents/[id]/link/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/documents/[id]/link/route.ts:23)

У route видно:

- `Phase A підтримує FINANCE_ENTRY; інші — placeholder для Phase B`

Тобто зараз document linking ще не повністю узагальнений і не покриває весь задуманий сценарій document control.

### Що доробити

1. Визначити, що входить у Beta для `Documents`.
2. Якщо в Beta обіцяється лише `FinanceEntry` linking:
   - зафіксувати це явно в UX і docs.
3. Якщо треба ширше:
   - доробити інші типи linkage;
   - перевірити статусні переходи документа;
   - перевірити review/link/archive lifecycle.

---

## 4.5. Procurement ще не можна вважати повністю готовим

У навігації procurement уже є, але сам модуль промаркований як `BETA`:

- [nav.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_lib/nav.ts:104)

Це правильний сигнал: модуль уже живий, але ще не повністю “production-safe”.

Що видно:

- є сторінка `procurement`;
- є requests / rfqs / orders pages;
- є API для supplier flow, award, remind, confirm delivery;
- але на стиках ще є недозавершені фази та високий ризик неповного циклу.

### Що доробити

Перевірити й замкнути повний procurement flow:

1. `Purchase Request`
2. `Send RFQ`
3. supplier open public link
4. submit bid
5. compare bids
6. award winner
7. create PO
8. confirm delivery
9. sync to finance
10. notifications / audit

Поки цей цикл не пройдено як один сценарій, procurement краще:

- або лишати в `BETA/internal`;
- або не включати в обіцянку першої Beta.

> Рішення для першої Beta: лишити BETA badge у nav. Поточний статус і Phase B gaps зафіксовані у [PROCUREMENT_BETA_NOTES.md](./PROCUREMENT_BETA_NOTES.md).

---

## 4.6. Частина інтеграцій ще повинна бути перевірена в реальному середовищі

Є модулі, де сама логіка виглядає добре, але без staging/dev walkthrough не можна підтвердити, що все реально працює:

- email delivery
- password reset emails
- OCR/import flows
- receipts
- meetings transcription
- public RFQ links
- file uploads
- signed URLs / R2
- cron-related reminder behavior

### Що доробити

1. Окремо пройти інтеграційний checklist:
   - email
   - uploads
   - OCR
   - AI-backed flows
   - public token flows
2. Зафіксувати, які env variables обов'язкові для Beta.
3. Перевірити fallback-поведінку при відсутності зовнішнього провайдера.

---

## 4.7. Beta-ready логіка є, але не всюди є Beta-ready UX

На рівні backend/domain у вас уже дуже багато чого готово. Але для Beta-користувача важливо інше:

- чи зрозуміло, що робити;
- чи немає тупикових станів;
- чи пояснено ролі сторінки;
- чи видно наступний крок;
- чи немає порожніх або неочікуваних станів без пояснення.

### Що доробити

1. Доробити help/onboarding на core modules.
2. Доробити empty states.
3. Доробити user-facing помилки.
4. Перевірити CTA consistency:
   - всі кнопки мають або працювати, або бути прибрані, або бути явно неактивні з поясненням.

---

## 5. Що потрібно доробити обов'язково перед Closed Beta

Це мінімальний набір.

### 5.1. Формально підтвердити релізну стабільність

Потрібно:

1. завершити `build`;
2. завершити `unit tests`;
3. прогнати сценарні smoke flows.

### 5.2. Розібрати warning-level ризики у core UI

Потрібно:

1. прибрати логічно небезпечні React warnings;
2. особливо перевірити:
   - dashboard hooks
   - help components
   - stateful admin-v2 interactive zones

### 5.3. Прибрати або закрити незавершені UX точки

Потрібно:

1. прибрати `coming soon` з core Beta pages;
2. закрити placeholder functions;
3. приховати незавершені entry points.

### 5.4. Пройти всі core user journeys вручну

Обов'язкові сценарії:

1. login
2. forgot password
3. create project
4. create estimate
5. open estimate details
6. financing add/edit flow
7. receipt scan/upload
8. counterparty dossier
9. create RFI
10. answer/close RFI
11. create change order

### 5.5. Окремо вирішити статус procurement

Потрібно:

1. або пройти весь procurement e2e;
2. або залишити модуль як internal/beta-only;
3. або виключити з першої хвилі.

---

## 6. Що бажано доробити перед Beta

### 6.1. Module-by-module checklist ✅

Готовий у [BETA_MODULE_CHECKLIST.md](./BETA_MODULE_CHECKLIST.md) — 9 модулів зі статусами ✅ / ⚠️ / 🔒, готові сторінки + API + known limitations.

### 6.2. Support runbooks ✅

Готовий у [BETA_SUPPORT_RUNBOOKS.md](./BETA_SUPPORT_RUNBOOKS.md) — recipe-чекліст за схемою симптом → діагностика → фікс для auth, receipts/OCR, financing imports, procurement, document linking, email delivery, prod hotfix.

### 6.3. Staging acceptance pass ✅

Готовий у [BETA_STAGING_ACCEPTANCE.md](./BETA_STAGING_ACCEPTANCE.md) — три чек-листи (dev / QA / product), 50+ перевірок із sign-off ритуалом.

---

## 7. Модулі: поточний стан після перевірки

### 7.1. `Projects`

Стан:

- виглядає сильно;
- core page зібрана логічно;
- є intro/help;
- структура виглядає Beta-реалістично.

Що доробити:

- пройти ручні сценарії створення/редагування/відкриття;
- перевірити folder flows і permissions.

### 7.2. `Estimates`

Стан:

- один із найсильніших модулів;
- є хороша основа;
- але в UI ще є недозавершені точки, напр. пошук.

Що доробити:

- або доробити пошук;
- або тимчасово прибрати цей блок;
- пройти end-to-end сценарій від створення до погодження.

### 7.3. `Financing`

Стан:

- дуже потужний модуль;
- уже схожий на core ERP block.

Що доробити:

- пройти найризиковіші сценарії руками;
- перевірити imports / receipts / project linking;
- перевірити role isolation.

### 7.4. `Counterparties / SRM`

Стан:

- добрий кандидат на Beta inclusion.

Що доробити:

- пройти dossier / compare / compliance / documents flow;
- перевірити реальну поведінку при відсутності зовнішніх ключів.

### 7.5. `Documents`

Стан:

- корисний і живий контур;
- але ще не повністю завершений як універсальна система linkages.

Що доробити:

- чітко зафіксувати Beta scope цього модуля;
- доробити або обмежити linking use cases.

### 7.6. `RFI`

Стан:

- хороший кандидат на Beta.

Що доробити:

- ручний сценарний прогін;
- перевірити reminders/escalations у staging.

### 7.7. `Change Orders`

Стан:

- виглядає достатньо зріло для Beta.

Що доробити:

- перевірити workflow transition path;
- перевірити signed/upload/generated PDF flows.

### 7.8. `Procurement`

Стан:

- структурно вже є;
- ще не можна назвати повністю доведеним.

Що доробити:

- повний e2e procurement pass;
- або офіційно лишити модуль у статусі `BETA/internal`.

---

## 8. Остаточний практичний висновок

Після перевірки правильна відповідь така:

**Система близька до Closed Beta, але ще не доведена до стану “все повністю готово”**.

Що найбільш важливо доробити:

1. завершити технічну верифікацію `build + tests`;
2. прибрати логічно небезпечні warnings у core UI;
3. пройти всі критичні user journeys вручну;
4. прибрати незавершені UX точки;
5. окремо вирішити статус procurement;
6. зафіксувати модулі, які реально входять у Beta.

Після цього можна запускати:

- **не широку Beta на всіх**
- а **керовану Closed Beta ERP Core**.
