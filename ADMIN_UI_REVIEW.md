# Admin UI Review

Дата перевірки: 2026-04-22

## Контекст

Цей документ стосується тільки UI адмінки, насамперед `admin-v2`.

Фокус:

- щоденна зручність для внутрішньої команди
- читабельність
- швидкість сканування
- зрілість операційного інтерфейсу

## Загальна оцінка UI

Стан зараз: `7/10`

Що вже добре:

- є своя дизайн-мова і theme tokens
- адмінка виглядає сучасно і не як шаблон
- `admin-v2` вже має кращу візуальну дисципліну, ніж legacy `admin`
- є спроба системності в layout, tabs, cards, chips, panels

Що заважає:

- забагато візуального акценту там, де потрібна спокійна робоча подача
- header, KPI, hero та feed-конструкції інколи змагаються між собою за увагу
- data-dense екрани місцями виглядають як “вітрина”, а не як операційна система
- не всюди видно єдині правила для таблиць, фільтрів, empty/loading/error states

## Сильні сторони

### 1. Є хороший базовий токен-шар

Де:

- [tokens.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/ai-estimate-v2/_components/tokens.ts:1)

Плюс:

- кольори і surface-рівні вже винесені в токени
- це хороша база для подальшого приведення UI до системи

### 2. `admin-v2` має зрозумілу layout-структуру

Де:

- [layout.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/layout.tsx:1)
- [sidebar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/sidebar.tsx:1)
- [header.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/header.tsx:1)

Плюс:

- sidebar, header, mobile shell і main area вже читаються як окрема система
- це правильний напрямок для внутрішнього продукту

### 3. Мобільна навігація продуманіша, ніж у багатьох внутрішніх системах

Де:

- [mobile-nav.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/mobile-nav.tsx:1)
- [mobile-drawer.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/mobile-drawer.tsx:1)

Плюс:

- є окремий mobile flow
- є drawer для другорядної навігації
- це краще, ніж намагатись просто схлопнути desktop sidebar

## Ключові UI-проблеми

### 1. Забагато декоративності в основних робочих елементах

Де:

- [sidebar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/sidebar.tsx:31)
- [kpi-card.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/dashboard/kpi-card.tsx:18)
- [hero-block.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/dashboard/hero-block.tsx:50)

Проблема:

- навігація, KPI і hero-контейнери мають градієнтні акценти, glow і підсвічені поверхні
- це робить UI ефектним, але менш спокійним для довгого робочого використання

Наслідок:

- важче швидко зчитувати, що головне
- увага розмазується між декором і даними

Що покращити:

- прибрати декоративний glow з KPI та активних навігаційних елементів
- залишити акцент лише на:
  - critical alerts
  - CTA-кнопках
  - активному tab/item
- hero і KPI зробити більш “data-first”

### 2. Header перевантажений для щоденного сценарію

Де:

- [header.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/header.tsx:43)

Проблема:

- у header одночасно є breadcrumbs, team avatars, AI button, theme toggle, notifications, avatar menu
- для desktop це вже близько до візуального шуму

Наслідок:

- top bar не працює як спокійний навігаційний шар
- важливі дії не відрізняються від другорядних

Що покращити:

- зібрати другорядні дії в один utility cluster або overflow/menu
- залишити в топ-барі лише:
  - breadcrumbs/page title
  - notifications
  - user menu
  - одну справді ключову global action
- team avatars і theme toggle винести в drawer/profile/utilities

### 3. Dashboard більше схожий на презентацію, ніж на операційну консоль

Де:

- [page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/page.tsx:1)
- [hero-block.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/dashboard/hero-block.tsx:1)
- [dashboard-tabs.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/dashboard/dashboard-tabs.tsx:1)

Проблема:

- dashboard має сильну “карточну” подачу
- багато виджетів мають схожий візуальний пріоритет
- немає достатньо чіткого розділення між:
  - status overview
  - urgent actions
  - navigation to work

Наслідок:

- сторінка виглядає насичено, але не завжди відразу зрозуміло, з чого почати день

Що покращити:

- зверху зробити 3 чіткі зони:
  - critical today
  - key numbers
  - next actions
- скоротити кількість однотипних KPI карток
- один блок зробити “операційним стартом”, а не просто summary

### 4. Проєкти в card-grid гарні, але не оптимальні для активного менеджменту

Де:

- [projects/page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/projects/page.tsx:80)

Проблема:

- карткова сітка добре підходить для огляду
- але для робочих задач менеджера бракує щільнішого режиму:
  - більше записів на екрані
  - швидше сортування
  - швидше порівняння статусів

Наслідок:

- при великій кількості проєктів grid стане повільним для сканування

Що покращити:

- додати toggle `Cards / Table / Compact`
- для default desktop view розглянути table-first або split-view
- у cards залишити лише найкорисніші метрики

### 5. Табличний патерн ще не достатньо сильний як система

Де:

- [DataTable.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/shared/DataTable.tsx:1)
- [ProjectsDashboardTable.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/admin/ProjectsDashboardTable.tsx:1)

Проблема:

- сортування в `DataTable` базується на `String(col.render(...))`
- таблиці та фільтри більше виглядають як окремі реалізації, ніж єдина дизайн-система
- filter UX ще важкий для інтенсивної роботи

Наслідок:

- таблиці важче стандартизувати
- зростає ризик, що кожен великий список буде “своїм окремим UI”

Що покращити:

- зробити один canonical table pattern для адмінки
- розділити:
  - toolbar
  - filters
  - bulk actions
  - table body
  - row actions
- використовувати чіткі typed accessors для sort/filter, а не `render()`

### 6. У фінансах багато можливостей, але інтерфейс дуже щільний

Де:

- [financing-view.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/financing/_components/financing-view.tsx:1)

Проблема:

- на одному екрані багато:
  - hero
  - quick actions
  - tabs
  - export
  - folders
  - filters
  - summaries
  - modal flows

Наслідок:

- високий cognitive load
- складно зрозуміти головний сценарій роботи для нового користувача

Що покращити:

- чітко розділити “огляд” і “операційну роботу”
- другорядні дії сховати в overflow або контекстні панелі
- залишити на верхньому рівні тільки 1 primary action для кожного сценарію

### 7. Feed виглядає чисто, але ще не має достатньої щільності сигналів

Де:

- [feed/page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/feed/page.tsx:1)

Проблема:

- feed візуально акуратний
- але як робоча стрічка він ще “м’який”
- бракує більш операційної подачі:
  - пріоритет
  - severity
  - read/unread
  - entity type
  - quick action

Наслідок:

- стрічка більше схожа на passive timeline, ніж на інструмент прийняття рішень

Що покращити:

- додати пріоритетність подій
- додати sticky filters
- додати quick actions прямо з рядка
- дати можливість перемикатись між `timeline` і `compact list`

## Системні покращення UI

### 1. Перейти до принципу “спокійний фон, сильні сигнали”

Правило:

- 80% інтерфейсу нейтральне
- акцент кольором лише там, де є дія або ризик

Що це означає:

- panels: спокійні
- nav: спокійний
- tables: спокійні
- alerts / overdue / CTA: яскраві

### 2. Побудувати одну робочу ієрархію екрана

На будь-якій сторінці зверху вниз:

1. де я
2. що головне зараз
3. що я можу зробити
4. детальні дані

Зараз ці шари місцями змішані.

### 3. Уніфікувати “toolbar pattern”

Для всіх великих екранів:

- title + subtitle
- primary action
- search
- filter
- saved views
- export

Це особливо потрібно для:

- projects
- estimates
- financing
- users
- reference lists

### 4. Вирівняти density modes

Для операційних сторінок додати режими:

- comfortable
- compact

Особливо для:

- project lists
- tables
- feed
- finance entries

### 5. Уніфікувати empty / loading / error states

Зараз вони вже є, але подекуди різняться стилем і тоном.

Потрібна одна система:

- neutral empty
- actionable empty
- blocking error
- retry state
- loading skeleton

## Швидкі UI wins

### 1. Sidebar

- зробити один спокійний active style
- прибрати декоративні тіні
- трохи зменшити контраст фону секцій

### 2. Header

- прибрати частину utility actions з top bar
- посилити page title / current context

### 3. Dashboard

- зменшити кількість KPI одного рівня
- зробити окремий блок “Потрібно сьогодні”

### 4. Projects

- додати table/compact view
- прибрати частину декоративної подачі з project cards

### 5. Finance

- спростити верхню панель дій
- згрупувати secondary actions

### 6. Feed

- додати compact mode
- додати priority/read markers

## Рекомендований порядок робіт

### Етап 1

1. Sidebar
2. Header
3. Dashboard hierarchy

### Етап 2

1. Canonical toolbar pattern
2. Canonical table pattern
3. Density modes

### Етап 3

1. Projects list redesign
2. Finance UI simplification
3. Feed as operational timeline

## Практичний висновок

UI адмінки вже має сильну основу і хороший потенціал.

Найбільше покращення дасть не “ще більше дизайну”, а навпаки:

- менше декоративності
- більше операційної ясності
- сильніша ієрархія
- єдині патерни для списків, фільтрів, таблиць і дій

Якщо коротко: адмінці треба перейти з “сучасний красивий інтерфейс” у “зрілий робочий інструмент”.
