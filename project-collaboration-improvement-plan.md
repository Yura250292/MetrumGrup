# План покращення колаборації в проєктах

## Мета

Перебудувати поточну логіку взаємодії в платформі так, щоб проєкт був єдиним робочим середовищем для команди:

- адмін створює проєкт;
- адмін додає учасників у проєкт;
- кожен учасник має роль у межах проєкту;
- усі учасники працюють всередині єдиного `Project Workspace`;
- у межах workspace доступні:
  - загальний чат проєкту;
  - обговорення;
  - файли;
  - фото;
  - активність;
  - пов'язані кошториси та документи.

Це має замінити поточну розрізнену модель, де чат, коментарі, файли і залучення користувачів пов’язані між собою лише частково.

---

## 1. Як зараз працює платформа

### 1.1. Участь у проєкті

Зараз проєкт напряму пов’язаний лише з:

- `clientId`
- `managerId`

У схемі немає окремої сутності членства в проєкті на кшталт `ProjectMember`.

Посилання:

- [prisma/schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma)

Наслідки:

- у проєкті немає явного списку команди;
- інженер, виконроб, фінансист, закупівельник та інші ролі не прив’язані до проєкту як перша сутність;
- доступ і залученість формуються фрагментарно.

### 1.2. Чат

У системі є окремий модуль чатів з 3 типами розмов:

- `DM`
- `PROJECT`
- `ESTIMATE`

Посилання:

- [src/lib/chat/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/chat/service.ts)
- [src/app/api/admin/chat/conversations/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/chat/conversations/route.ts)
- [prisma/schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma)

Поточна логіка:

- `DM` доступний тільки staff-користувачам;
- чат проєкту створюється окремо як conversation;
- чат кошторису створюється окремо як conversation;
- список чатів показує лише ті розмови, де користувач уже є participant.

Проблеми:

- чат не є джерелом істини по команді проєкту;
- учасники проєкту не синхронізуються автоматично з командою;
- клієнт не включений у повноцінний chat workflow;
- project chat існує як окрема функція, а не як частина workspace.

### 1.3. Коментарі

Окремо є система коментарів для:

- `PROJECT`
- `ESTIMATE`

Посилання:

- [src/lib/comments/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/comments/service.ts)
- [src/components/collab/CommentThread.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/collab/CommentThread.tsx)

Проблеми:

- коментарі дублюють частину сценаріїв, які вже частково покриває чат;
- користувачеві треба розуміти різницю між "чатом" і "обговоренням";
- немає єдиного collaborative timeline.

### 1.4. Файли та фото

У проєкту вже є окремі сутності:

- `ProjectFile`
- `PhotoReport`

Посилання:

- [prisma/schema.prisma](/Users/admin/Igor-Shiba/metrum-group/prisma/schema.prisma)
- [src/lib/projects/files-service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/files-service.ts)
- [src/components/projects/ProjectFilesSection.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/projects/ProjectFilesSection.tsx)

Поточна логіка:

- staff може завантажувати файли у проєкт;
- файли прив’язані до `projectId`;
- фото живуть окремо в `PhotoReport`;
- клієнт бачить документи й фото через окремі сторінки перегляду.

Проблеми:

- файли й фото не вбудовані в єдину модель collaboration;
- немає явних permission rules на рівні membership у проєкті;
- немає зв’язку "хто в команді має право бачити/додавати/видаляти".

### 1.5. Навігація і доступ

Зараз:

- в адмінці є окремий розділ `Чат`;
- у клієнтському кабінеті окремого розділу чату немає;
- сторінка проєкту для staff має кнопку відкриття project chat і окремий блок comments;
- сторінка кошторису має окремий estimate chat і окремий discussion tab.

Посилання:

- [src/components/layout/AdminSidebar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/layout/AdminSidebar.tsx)
- [src/components/layout/ClientSidebar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/layout/ClientSidebar.tsx)
- [src/app/admin/projects/[id]/page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin/projects/[id]/page.tsx)
- [src/app/admin/estimates/[id]/page.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin/estimates/[id]/page.tsx)

### 1.6. Як зараз визначається "команда проєкту"

У агрегації проєктів команда будується як:

- менеджер;
- плюс учасники project conversation.

Посилання:

- [src/lib/projects/aggregations.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/aggregations.ts)

Це критична архітектурна проблема:

- команда не повинна виводитись із чату;
- чат повинен залежати від членства в проєкті, а не навпаки.

---

## 2. Цільова логіка

### 2.1. Базовий принцип

Потрібно перейти до моделі:

- `Project` = бізнес-сутність;
- `ProjectMember` = хто входить у команду проєкту;
- `ProjectWorkspace` = середовище спільної роботи;
- усі collaborative-інструменти перевіряють доступ через `ProjectMember`.

### 2.2. Як має працювати сценарій

1. Адмін створює проєкт.
2. Адмін формує команду проєкту.
3. Учасникам призначаються ролі в межах проєкту.
4. Автоматично створюється project workspace.
5. Учасники проєкту бачать цей проєкт у своєму кабінеті.
6. Всередині проєкту вони можуть:
   - писати в загальний чат;
   - залишати коментарі;
   - завантажувати файли;
   - додавати фото;
   - бачити історію активності;
   - працювати з кошторисами та документами, якщо мають право.

### 2.3. Ролі в межах проєкту

Потрібно розрізнити:

- системну роль користувача;
- роль користувача в конкретному проєкті.

Наприклад:

- системна роль: `SUPER_ADMIN`, `MANAGER`, `ENGINEER`, `FINANCIER`
- роль у проєкті: `PROJECT_ADMIN`, `PROJECT_MANAGER`, `ENGINEER`, `FOREMAN`, `FINANCE`, `PROCUREMENT`, `VIEWER`, `CLIENT`

Це дає змогу:

- одному й тому самому користувачу бути менеджером в одному проєкті і лише observer в іншому;
- гнучко будувати права без дублювання акаунтів.

---

## 3. Цільова архітектура

## 3.1. Нова сутність `ProjectMember`

Рекомендована модель:

```prisma
model ProjectMember {
  id            String   @id @default(cuid())
  projectId      String
  userId         String
  roleInProject  String
  permissions    Json?
  joinedAt       DateTime @default(now())
  invitedById    String?
  isActive       Boolean  @default(true)

  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId, isActive])
  @@map("project_members")
}
```

Що це вирішує:

- у кожного проєкту з’являється явна команда;
- права можна виводити з membership;
- відображення команди стає стабільним;
- чат, файли, фото і активність легко прив’язуються до тих самих users.

## 3.2. Workspace-орієнтований доступ

Усі перевірки доступу повинні будуватись через правило:

- користувач має бути `ProjectMember`
- або мати глобальну admin-привілею

Це потрібно застосувати до:

- project chat
- comments
- files
- photo reports
- estimates within project
- project activity

## 3.3. Проєктний чат

Чат має стати частиною проєкту:

- один `project general channel`;
- необов’язково пізніше можна додати підканали;
- учасники чату синхронізуються з `ProjectMember`;
- при додаванні людини в проєкт вона автоматично стає учасником project chat.

Поточний `Conversation(type=PROJECT)` можна не викидати, а адаптувати:

- залишити як storage-модель повідомлень;
- змінити правило формування participants;
- синхронізувати participants із membership.

## 3.4. Коментарі

Коментарі бажано не прибирати, а змінити їх позицію:

- чат = оперативна комунікація команди;
- comments = предметне обговорення сутностей;
- усі comments також мають підпорядковуватися `ProjectMember`.

Рекомендація:

- залишити comments для конкретних сутностей;
- але в UI показувати їх як частину `Project Workspace`, а не як ізольований механізм.

## 3.5. Файли

Файли мають стати повноцінним блоком workspace:

- загальні документи проєкту;
- креслення;
- технічні файли;
- текстові нотатки;
- пов’язані вкладення для AI-кошторису.

Покращення моделі `ProjectFile`:

- `category`
- `visibility`
- `linkedEntityType`
- `linkedEntityId`
- `uploadedInContext`

Приклад:

- `category = PLAN | CONTRACT | TECH_DOC | NOTE | PHOTO_ATTACHMENT`
- `visibility = TEAM | CLIENT | INTERNAL`

## 3.6. Фото

Фото теж мають бути частиною workspace, а не лише окремим модулем звітів.

Рекомендована логіка:

- `PhotoReport` лишається для формалізованих звітів;
- паралельно фото повинні відображатися у загальному media stream проєкту;
- кожне фото має бути доступне з activity feed, файлового перегляду або photo workspace.

## 3.7. Activity feed

Потрібно зробити єдину активність по проєкту.

У feed мають входити:

- нові повідомлення в чаті;
- нові коментарі;
- завантаження файлів;
- нові фото;
- створення/оновлення кошторису;
- зміни складу команди;
- зміни статусу проєкту.

Поточний feed вже частково існує, але його треба зробити project-centric.

Посилання:

- [src/lib/feed/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/feed/service.ts)

---

## 4. Що саме треба змінити

## 4.1. База даних

### Обов’язково

1. Додати `ProjectMember`.
2. Додати relation `project.members`.
3. Зробити migration existing data:
   - client може стати `CLIENT`-member за потреби;
   - manager має бути автоматично доданий у `ProjectMember`;
   - staff, які вже є в project conversation, треба перенести в `ProjectMember`.

### Бажано

4. Додати розширені поля в `ProjectFile`.
5. Додати тип activity event або окрему таблицю `ProjectActivityEvent`.

## 4.2. Backend access layer

Потрібно створити єдиний набір перевірок:

- `canViewProject(projectId, userId)`
- `canParticipateInProject(projectId, userId)`
- `canUploadProjectFiles(projectId, userId)`
- `canManageProjectMembers(projectId, userId)`
- `canViewProjectFinancials(projectId, userId)`

Зараз перевірки розкидані між `requireStaffAccess`, `clientId === session.user.id`, участю в conversation і локальними перевірками. Це треба централізувати.

## 4.3. Чат

Потрібно змінити:

1. Створення project chat:
   - conversation має створюватись автоматично разом із проєктом або при першому вході в workspace.

2. Participants:
   - формуються з `ProjectMember`, а не вручну.

3. Додавання учасника:
   - при додаванні member він автоматично додається в chat participant list.

4. Видалення учасника:
   - member деактивується і втрачає доступ до чату.

5. API:
   - усі endpoints по project chat мають перевіряти membership.

## 4.4. Коментарі

Потрібно:

1. Зав’язати comments access на `ProjectMember`.
2. Для estimate comments перевіряти access через пов’язаний project.
3. Уніфікувати mention behavior для всіх учасників проєкту, не лише staff, якщо клієнт теж член workspace.

## 4.5. Файли й фото

Потрібно:

1. Перевести files access на `ProjectMember`.
2. Ввести права:
   - upload
   - delete
   - client-visible
   - internal-only

3. Для фото:
   - дозволити перегляд через загальний медіа-блок;
   - додати project activity entry на створення фотозвіту;
   - додати можливість швидкого завантаження фото прямо в workspace.

## 4.6. Проєктний UI

Потрібно перебудувати сторінку проєкту в `workspace`-логіку.

Рекомендована структура:

- `Overview`
- `Team`
- `Chat`
- `Files`
- `Photos`
- `Activity`
- `Estimates`
- `Finances`
- `Settings`

Що важливо:

- чат більше не повинен відкриватися як "побічний" інструмент через окрему кнопку;
- workspace має бути primary interaction layer;
- comments не повинні виглядати як випадковий блок у кінці сторінки.

## 4.7. Клієнтський доступ

Треба визначити 2 варіанти:

### Варіант A. Клієнт як `ProjectMember`

Плюси:

- одна модель доступу;
- простіше підтримувати;
- сповіщення, чат і activity працюють однаково.

Мінуси:

- потрібні чіткі обмеження видимості;
- треба акуратно розділити internal/team-only контент і client-visible контент.

### Варіант B. Клієнт як зовнішній viewer

Плюси:

- простіше ізолювати внутрішню командну комунікацію;
- менший ризик витоку внутрішніх нотаток.

Мінуси:

- доведеться дублювати частину правил доступу;
- collaboration model стане складнішою.

Рекомендація:

- для першої версії лишити клієнта поза team chat;
- але підготувати модель так, щоб клієнта пізніше можна було додати як `CLIENT`-member з обмеженими правами.

---

## 5. План впровадження по етапах

## Етап 1. Ввести `ProjectMember` як джерело істини

### Ціль

Відв’язати команду проєкту від chat participants.

### Задачі

1. Додати `ProjectMember` у Prisma schema.
2. Створити migration.
3. Написати backfill script:
   - додати manager як member;
   - додати staff participants із project chat як members;
   - опційно додати client як `CLIENT`-member.
4. Оновити `listProjectsWithAggregations`:
   - команду брати з `ProjectMember`;
   - unread chat рахувати окремо.
5. Додати service layer для membership.

### Результат

- у кожного проєкту є явна команда;
- chat більше не використовується як сурогат team registry.

## Етап 2. Перенести доступ до проєкту на membership rules

### Ціль

Зробити єдину permission model.

### Задачі

1. Створити policy helpers для проєктів.
2. Оновити project files API.
3. Оновити photo reports API.
4. Оновити comments service.
5. Оновити estimate-related access через `estimate.projectId`.

### Результат

- доступ визначається однаково в усіх модулях;
- логіка стає передбачуваною.

## Етап 3. Синхронізувати project chat з membership

### Ціль

Перетворити чат на вбудований інструмент команди.

### Задачі

1. Змінити `getOrCreateProjectChannel`.
2. Забезпечити auto-participation для members.
3. Забезпечити revoke access при деактивації member.
4. Додати admin UI для управління членами проєкту.
5. Оновити unread counters і conversation list.

### Результат

- project chat стає похідним від team membership;
- onboarding у проєкт автоматично дає доступ до комунікації.

## Етап 4. Перебудувати UI в `Project Workspace`

### Ціль

Зробити проєкт єдиним місцем роботи для команди.

### Задачі

1. Переробити project detail page.
2. Додати окрему вкладку `Team`.
3. Перенести chat у вкладку `Chat`.
4. Перенести files у вкладку `Files`.
5. Перенести photos у вкладку `Photos`.
6. Зробити `Activity` tab.
7. Вивести comments у контексті відповідних вкладок або окремої `Discussion`.

### Результат

- користувач не стрибає між окремими інструментами;
- collaboration стає частиною проектного UX.

## Етап 5. Додати гнучкі permissions і клієнтський режим

### Ціль

Розвести внутрішню і зовнішню взаємодію.

### Задачі

1. Ввести granular permissions.
2. Визначити client-visible content.
3. Додати фільтри для internal-only / client-visible.
4. Розглянути client thread або client comment layer.

### Результат

- з’являється контрольована модель доступу для клієнта;
- внутрішня кухня команди не змішується з клієнтським інтерфейсом.

---

## 6. Пріоритети

### Високий пріоритет

- `ProjectMember`
- migration existing projects
- централізований access layer
- sync chat with membership
- workspace-based project page

### Середній пріоритет

- unified project activity
- file visibility levels
- team management UI

### Нижчий пріоритет

- client as full project member
- sub-channels inside project
- task-level threaded collaboration

---

## 7. Ризики

1. Міграція старих проєктів.
   Якщо перенести дані неакуратно, частина користувачів тимчасово втратить доступ до чатів або файлів.

2. Розрив між old chat participants і new project members.
   Потрібен перехідний період, де система вміє працювати з обома моделями, поки не завершено backfill.

3. Змішування системної ролі й ролі в проєкті.
   Якщо не розвести ці поняття, permission model швидко стане нечитабельною.

4. Клієнтський доступ.
   Якщо додати клієнта в workspace без visibility model, можна відкрити внутрішній контент.

---

## 8. Рекомендований порядок реалізації

1. Спочатку зробити `ProjectMember` і migration.
2. Потім перевести backend access checks.
3. Потім синхронізувати project chat.
4. Потім перебудувати project UI у workspace.
5. Після цього розширювати permissions і client mode.

---

## 9. Практичний висновок

Головна проблема поточної системи не в тому, що немає чату, файлів чи фото. Вони вже є. Проблема в тому, що вони не об’єднані єдиною моделлю участі в проєкті.

Правильний напрямок:

- спочатку ввести явну команду проєкту;
- потім підпорядкувати їй чат, коментарі, файли, фото і активність;
- потім зібрати це в один `Project Workspace`.

Саме така модель відповідає цільовій логіці:

- адмін створює проєкт;
- додає працівників;
- команда працює всередині проєкту як у спільному середовищі.
