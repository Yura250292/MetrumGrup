# Chat Vs Worksection Review

Цей документ фіксує різницю між поточною реалізацією меню/модуля чатів у проєкті та тим, як Worksection будує командну комунікацію.

## Core Difference

У нас:
- чат — це окремий глобальний модуль у sidebar
- є окремий inbox-style список розмов
- є окремі типи розмов: `DM`, `PROJECT`, `ESTIMATE`

У Worksection:
- комунікація в першу чергу живе всередині задачі
- task discussion = основний робочий chat context
- comments/files/mentions/reactions є частиною task execution flow, а не окремим messenger layer

## Comparison Table

| Area | У нас | У Worksection | Чого немає у нас |
|---|---|---|---|
| Точка входу | Окреме меню `Чат` у sidebar | Комунікація в задачах і проєктах | Немає task-first communication model |
| Основна модель | Messenger-style conversation list | Task-centric discussion | Немає єдиного execution-thread всередині task |
| Типи каналів | `DM`, `PROJECT`, `ESTIMATE` | Переважно task discussion, project context | Немає task channel як основного типу розмови |
| Direct messages | Є | Публічно не є центром продукту | Тут ми навіть сильніші як messenger |
| Project chat | Є | Комунікація радше через tasks/project context | Немає глибокої інтеграції project chat → task workflow |
| Estimate chat | Є | Не є типовим core concept | Це наша кастомна сильна сторона |
| Task chat | Є task comments, але не як головний chat shell | Built-in chat у кожній задачі | Немає повноцінного task thread UX |
| Files in discussion | У chat module не видно attachments | Файли прямо в task discussion | Немає chat attachments |
| Mentions | Є | Є | Паритет частковий |
| Reactions | Є | Є | Паритет частковий |
| Notification model | unread + mentions + read state | author/executive/subscribers task | Немає task subscriber-driven communication model |
| Client communication | Staff-only chat | Є client visibility model у задачах | Немає client-facing task communication |
| Privacy model | Participant-based conversation membership | Task visibility per people / hide from client | Немає task-level communication privacy model як core flow |
| Working context | Розмова окремо від задачі | Розмова вбудована в задачу | Немає “everything around the task” experience |

## What Is Implemented Now

### Sidebar and entry point

- Окремий пункт меню `Чат`:
  [src/app/admin-v2/_lib/nav.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_lib/nav.ts:38)

### Chat shell

- Chat shell з conversation list і thread:
  [src/components/chat/ChatLayout.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/chat/ChatLayout.tsx:1)
  [src/components/chat/ConversationList.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/chat/ConversationList.tsx:1)
  [src/components/chat/MessageThread.tsx](/Users/admin/Igor-Shiba/metrum-group/src/components/chat/MessageThread.tsx:1)

### Conversation types

- `DM`, `PROJECT`, `ESTIMATE`:
  [src/hooks/useChat.ts](/Users/admin/Igor-Shiba/metrum-group/src/hooks/useChat.ts:30)
  [src/lib/chat/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/chat/service.ts:67)

### Access model

- Chat staff-only через `requireStaffAccess()`:
  [src/app/api/admin/chat/conversations/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/chat/conversations/route.ts:17)
  [src/app/api/admin/chat/conversations/[id]/messages/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/chat/conversations/[id]/messages/route.ts:17)

### Project conversation sync

- Project chat participants derived from `ProjectMember`:
  [src/lib/chat/sync.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/chat/sync.ts:1)

## Main Gaps Relative To Worksection

### 1. Немає task-first communication architecture

У Worksection центр комунікації — задача.

У нас:
- task comments існують окремо
- chat існує окремо
- user experience розділений на два різних канали

Що бракує:
- task thread як primary communication surface
- одна точка контексту: description + files + comments + mentions + history + decisions

### 2. Немає єдиного task execution thread

У Worksection обговорення живе там же, де:
- відповідальний
- дедлайн
- чекліст
- файли
- підписники
- прогрес

У нас це розкидано:
- task comments окремо
- project chat окремо
- files окремо
- notifications окремо

### 3. Немає attachments у chat messages

У chat module зараз текст + reactions + mentions.

Що бракує:
- file upload у message composer
- preview/download у thread
- збереження file-message linkage

### 4. Немає task subscriber communication model

У Worksection нотифікації по task communication природно йдуть:
- author
- executive
- subscribers

У нас немає явного unified subscriber-based chat model навколо task thread.

### 5. Немає client-facing communication mode

У нас chat staff-only.

У Worksection клієнт може бути в системі, а task visibility контролюється окремо.

Що бракує:
- зовнішній communication layer для client-safe task discussions
- task visibility policy, яка визначає, хто бачить discussion

### 6. Немає task channel як first-class conversation type

Зараз conversation types:
- `DM`
- `PROJECT`
- `ESTIMATE`

Що бракує:
- `TASK`

Саме це найважливіше для зближення з Worksection-підходом.

## Recommended Product Direction

Якщо ціль — наблизити продукт до Worksection, рекомендований напрям:

1. Не прибирати існуючий глобальний chat.
2. Але перестати вважати його головною робочою комунікацією.
3. Зробити `TASK` conversation/thread головним execution context.
4. Звести comments/files/mentions/reactions/history до одного task discussion UX.

## Concrete Task

### Phase 1 — Product decision

Визначити target model:

- `Chat` лишається окремим messenger module для:
  - `DM`
  - `PROJECT`
  - `ESTIMATE`
- але task communication переноситься у first-class `TASK` thread

### Phase 2 — Data and service layer

Потрібно:

- або додати `TASK` як `Conversation.type`
- або офіційно вирішити, що task comments і є task chat, і тоді не дублювати це окремою моделлю

Рекомендація:
- не тримати дві паралельні системи для task communication
- вибрати один canonical thread model

### Phase 3 — UI

Потрібно:

- у `TaskDrawer` / task detail показувати повноцінний thread
- підтримати:
  - files
  - mentions
  - reactions
  - read/unread state
  - notification targets

### Phase 4 — Access model

Потрібно:

- визначити, хто бачить task discussion:
  - project members
  - assignees
  - watchers
  - private task allow-list
  - client-safe visibility mode

### Phase 5 — Navigation

Потрібно:

- вирішити роль глобального меню `Чат`

Варіанти:

- залишити як inbox для `DM` / `PROJECT` / `ESTIMATE`
- не дублювати task communication там

або

- додати task-related inbox aggregations без окремого паралельного thread model

## Recommended Engineering Decision

Найкращий напрям:

- глобальний `Чат` залишити як auxiliary communication center
- task communication не будувати як паралельний messenger
- task comments/thread зробити canonical collaboration layer для execution

## Definition Of Done

Вважати chat layer ближчим до Worksection після того, як:

- task communication стане first-class UX
- task files/comments/mentions/reactions будуть в одному потоці
- не буде двох паралельних моделей для task discussion
- client/task visibility rules будуть визначені явно
- глобальний chat перестане конкурувати з task discussion за роль основного робочого каналу
