# Architecture For Claude

Цей файл створений як постійний контекст для Claude Code / Codex / інших агентів, які працюють із репозиторієм.

Мета:

- швидко зрозуміти, що це за продукт
- бачити актуальну архітектуру без повторного аналізу всього коду
- розрізняти поточну реалізацію і цільову інфраструктуру
- мати спільну ментальну модель перед змінами в коді

## 1. Що це за проєкт

`metrum-group` це веб-платформа для будівельної компанії Metrum Group.

Система поєднує:

- публічний маркетинговий сайт
- внутрішню admin/CRM/ERP частину
- клієнтський кабінет
- модулі кошторисів
- фінансовий workflow
- облік матеріалів і ресурсів
- фотозвіти та документи по проєктах
- базову CMS-модель для новин, портфоліо та сторінок

По суті це не просто сайт, а операційна система для управління будівельними проєктами.

## 2. Цільова інфраструктура

Проєкт орієнтований на таку production-схему:

- Frontend + server runtime: `Vercel`
- Основна база даних: `Railway PostgreSQL`
- Файлове сховище: `Cloudflare R2`

### Важливе уточнення

Це саме цільова/деплойна архітектура.

Поточний стан коду:

- Vercel deployment явно підтриманий
- PostgreSQL через Prisma повністю реалізований
- Railway використовується як рекомендований managed Postgres у документації
- Cloudflare R2 згадується в deployment docs і env-перевірках, але повна інтеграція storage-layer в коді ще не завершена

Тобто:

- база вже реально є core-частиною системи
- R2 наразі радше інфраструктурний target, ніж завершений application module

## 3. Технологічний стек

### Application layer

- `Next.js 16`
- `React 19`
- `TypeScript`
- `App Router`

### UI / styling

- `Tailwind CSS v4`
- власні UI-компоненти в `src/components/ui`
- motion/animation через `framer-motion`

### Auth

- `next-auth` v5 beta
- credentials login
- JWT session strategy

### Database

- `PostgreSQL`
- `Prisma ORM`

### AI / estimate tooling

- `OpenAI SDK`
- `Anthropic SDK`
- `Google Generative AI SDK`
- `pdf-parse`
- `xlsx`
- `exceljs`
- `jspdf`

### Client-side data

- `@tanstack/react-query`

## 4. Runtime модель

Це full-stack Next.js застосунок.

В одному репозиторії живуть:

- публічний frontend
- серверні сторінки
- API routes
- auth logic
- database access
- бізнес-логіка

Немає окремого backend-сервісу поза Next.js.

Основний бекенд тут це:

- `app/api/*` routes
- server components
- `src/lib/*` доменні модулі
- Prisma як data layer

## 5. Як система розкладена по зонах

### 5.1 Public site

Маршрут:

- `/`

Призначення:

- презентація компанії
- послуги
- портфоліо
- команда
- відгуки
- контакти

Поточний стан:

- головна сторінка сильно хардкоджена в `src/app/page.tsx`
- публічна CMS-модель у схемі БД існує, але використовується не повністю

### 5.2 Auth zone

Маршрути:

- `/login`
- `/register`

Призначення:

- логін користувачів
- реєстрація нових клієнтів

### 5.3 Admin zone

Маршрути:

- `/admin/*`

Це внутрішня операційна панель для компанії.

Тут живуть:

- dashboard
- проєкти
- кошториси
- матеріали
- фінанси
- користувачі
- налаштування
- CMS-секції
- ресурси

### 5.4 Client zone

Маршрути:

- `/dashboard/*`

Це кабінет клієнта.

Тут клієнт бачить:

- свої проєкти
- прогрес етапів
- платежі
- акти
- фото
- документи
- профіль
- сповіщення

## 6. Directory map

### `src/app`

Головна зона Next.js App Router.

Основні сегменти:

- `src/app/page.tsx`
  - landing page
- `src/app/(auth)`
  - auth pages
- `src/app/admin`
  - admin UI pages
- `src/app/dashboard`
  - client dashboard pages
- `src/app/api`
  - backend routes

### `src/components`

UI-компоненти застосунку.

Групи:

- `ui`
  - базові atoms / primitives
- `landing`
  - компоненти головної публічної сторінки
- `dashboard`
  - компоненти для клієнтського кабінету
- `layout`
  - shell/navigation components
- `shared`
  - загальні обгортки і reusable widgets

### `src/lib`

Серце серверної логіки.

Тут лежать:

- auth config
- prisma client
- audit logging
- фінансові обчислення
- workflow кошторисів
- helper functions
- prompts для AI
- validators / schemas

### `prisma`

- `schema.prisma`
- `seed.ts`

Тут описана вся доменна модель і тестові дані.

### `scripts`

Операційні утиліти для деплою і підтримки.

Приклади:

- перевірка env
- статус БД
- створення admin user
- сценарії для фінансиста

## 7. Дані та доменна модель

Нижче головні сутності, які формують систему.

### Users

Сутність:

- `User`

Поля:

- email / password
- name / phone / avatar
- role
- isActive

Ролі:

- `SUPER_ADMIN`
- `MANAGER`
- `ENGINEER`
- `FINANCIER`
- `CLIENT`
- `USER`

### Projects

Сутність:

- `Project`

Пов'язана з:

- client
- manager
- stages
- estimates
- payments
- photo reports
- files
- audit logs

Проєкт це центральна business unit системи.

### Stages

Сутність:

- `ProjectStageRecord`

Призначення:

- відслідковування етапів будівництва
- progress/status по кожному етапу

Етапи:

- design
- foundation
- walls
- roof
- engineering
- finishing
- handover

### Estimates

Сутності:

- `Estimate`
- `EstimateSection`
- `EstimateItem`

Призначення:

- ручне створення кошторисів
- AI generation
- engineer/finance workflow
- фінальне погодження

Estimate включає:

- базові totals
- секції
- позиції
- engineer notes
- finance notes
- податки
- логістику
- рентабельність
- фінальну client price

### Finance

Сутності:

- `Payment`
- `CompletionAct`
- `FinancialTemplate`

Призначення:

- графік оплат
- акти виконаних робіт
- reusable шаблони рентабельності/податків

### Materials / inventory / resources

Сутності:

- `Material`
- `LaborRate`
- `Warehouse`
- `InventoryItem`
- `InventoryTransaction`
- `Equipment`
- `Worker`
- `CrewAssignment`

Призначення:

- матеріали
- прайсинг
- склад
- техніка
- робітники

### Content / CMS

Сутності:

- `PortfolioProject`
- `NewsArticle`
- `Page`
- `Setting`

Призначення:

- публічний контент
- новини
- портфоліо
- кастомні сторінки
- системні налаштування

### Communication / observability

Сутності:

- `Notification`
- `AuditLog`

Призначення:

- події для користувача
- аудит змін

## 8. Authentication і authorization

Файл:

- `src/lib/auth.ts`

Логіка:

- credentials provider
- user lookup через Prisma
- перевірка bcrypt hash
- перевірка `isActive`
- JWT token strategy

Middleware:

- `src/middleware.ts`

Захищає:

- `/dashboard/*`
- `/admin/*`
- `/login`
- `/register`

Поведінка:

- неавторизованих редіректить на login
- admin roles редіректяться з `/dashboard` до `/admin`
- `CLIENT` редіректиться з `/admin` до `/dashboard`
- `SUPER_ADMIN` only для частини адмін-маршрутів

Важливо:

- UI-захист існує
- але доступ у деяких API routes треба завжди перевіряти окремо
- не можна покладатися тільки на редіректи сторінок

## 9. API архітектура

API реалізований через Next.js route handlers у `src/app/api`.

Основні групи:

### Public/auth

- `api/auth/[...nextauth]`
- `api/auth/register`

### Client-facing project APIs

- `api/projects`
- `api/projects/[id]`
- `api/projects/[id]/payments`
- `api/projects/[id]/photos`

### Admin APIs

- `api/admin/projects`
- `api/admin/estimates`
- `api/admin/materials`
- `api/admin/users`
- `api/admin/financial-templates`
- `api/admin/resources/*`
- `api/admin/init/financier`

### Estimate-specific advanced APIs

- `api/admin/estimates/generate`
- `api/admin/estimates/refine`
- `api/admin/estimates/export`
- `api/admin/estimates/[id]/finance`

## 10. AI subsystem

AI тут сконцентрований навколо кошторисів.

### Generate

Файл:

- `src/app/api/admin/estimates/generate/route.ts`

Може:

- прочитати PDF
- прочитати Excel/CSV/TXT
- передати image data
- згенерувати структурований estimate JSON

Моделі:

- Gemini
- OpenAI
- Anthropic

### Refine

Файл:

- `src/app/api/admin/estimates/refine/route.ts`

Призначення:

- редагування вже згенерованого кошторису по engineer prompt

### Export

Файл:

- `src/app/api/admin/estimates/export/route.ts`

Призначення:

- PDF / Excel export кошторису

### Важлива архітектурна особливість

AI-флоу зараз не винесений у background workers.

Це означає:

- генерація виконується в межах HTTP request
- система залежить від timeout'ів platform runtime
- для важких документів можливі затримки або fail-сценарії

## 11. Data storage модель

### 11.1 Основна база

Основне джерело істини:

- `PostgreSQL`

Через Prisma тут зберігаються:

- users
- projects
- financial data
- estimate data
- resources
- content
- audit logs
- notifications

### 11.2 Файли і медіа

Цільова модель:

- binary/file storage у `Cloudflare R2`
- metadata + URLs у PostgreSQL

Поточний стан коду:

- у схемі БД вже є таблиці/поля для file references:
  - `ProjectFile.url`
  - `CompletionAct.fileUrl`
  - `PhotoReportImage.url`
- у поточному коді файли часто задаються як уже готові URL
- окремого завершеного R2 upload service layer у коді поки немає

### Практичний висновок для агентів

Якщо треба додавати файловий upload:

- не вважати, що R2 уже повністю реалізований
- спочатку перевірити, чи є існуючий upload abstraction
- якщо немає, проектувати окремий storage module

Рекомендована майбутня форма:

- `src/lib/storage/r2.ts`
- signed upload або server upload
- normalized metadata save у `ProjectFile` / related models

## 12. Deployment модель

### Vercel

У Vercel крутиться:

- Next.js frontend
- server-side rendering
- API routes
- auth callbacks

Документація в репо орієнтує саме на Vercel.

### Railway PostgreSQL

Railway рекомендований як managed production database.

Очікування:

- `DATABASE_URL` з `sslmode=require`
- Prisma працює напряму з Railway Postgres

### Cloudflare R2

Документація вже передбачає env vars:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_PUBLIC_URL`

Але це не означає, що upload/download flows уже повністю реалізовані.

## 13. Current implementation status

### Добре реалізовано

- Next.js app shell
- базова auth система
- Prisma schema з багатою доменною моделлю
- admin/client routing
- estimate and finance modules
- deployment docs
- Vercel-compatible build

### Частково реалізовано

- CMS інтеграція з публічним сайтом
- фінансовий workflow як цілісна business flow abstraction
- повна типізація API DTO

### Ще не завершено або не доведено до production-ready стану

- Cloudflare R2 як реальний storage backend
- єдина access-control модель для всіх API
- повний CI quality gate
- фонова обробка довгих AI jobs

## 14. Важливі правила для Claude Code

При роботі з цим репозиторієм слід виходити з таких припущень:

### 14.1 Це monolith

Не шукати окремий backend repo або microservices.

Основний application backend уже знаходиться в Next.js.

### 14.2 Prisma schema це ключ до домену

Перед великими змінами по бізнес-логіці завжди перевіряти:

- `prisma/schema.prisma`

Бо саме там зафіксовані реальні зв'язки сутностей.

### 14.3 Публічний сайт і внутрішня система це один продукт

Не сприймати landing page як окремий маркетинговий репозиторій.

Це та сама система, просто з різними зонами доступу.

### 14.4 Не припускати, що storage вже production-ready

R2 згадується в docs, але перед реалізацією upload-related задач треба перевірити фактичний code path.

### 14.5 Не покладатися лише на page-level redirects

При змінах у `api/*` завжди перевіряти ACL окремо.

### 14.6 AI-модулі чутливі до runtime constraints

Будь-яка зміна в estimate generation/refinement має враховувати:

- execution time
- розмір payload
- формат JSON response
- failover behavior

## 15. Рекомендовані майбутні модулі

Щоб архітектура стала чистішою, корисно мати такі абстракції:

- `src/lib/access`
  - централізований ACL
- `src/lib/storage`
  - R2 upload/download abstraction
- `src/lib/services`
  - application services для estimates/projects/finance
- `src/lib/dto`
  - request/response contracts
- `src/lib/jobs`
  - async AI processing, якщо система розростеться

## 16. One-paragraph summary

Це Next.js 16 full-stack monolith для будівельної компанії Metrum Group: публічний сайт, admin CRM/ERP, клієнтський кабінет, кошториси, фінанси, ресурси, CMS і AI-обробка кошторисів. У продакшні система задумана як `Vercel + Railway PostgreSQL + Cloudflare R2`, де PostgreSQL уже є повноцінним core data store, а R2 ще потребує завершеної інтеграції як окремого storage layer для файлів і медіа.
