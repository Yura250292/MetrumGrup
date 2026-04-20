# Tasks Review Action Plan

Цей файл — практична інструкція після повного ревю task-модуля.
Мета: прибрати дублювання, закрити permission gaps, довести консистентність API/UI і стабілізувати модуль перед подальшим розширенням.

## Main Goal

Перед додаванням нових фіч потрібно:

1. закрити critical permission bugs
2. прибрати дубльовану поведінку
3. уніфікувати mutation policy
4. стабілізувати time/comments/views/export
5. тільки після цього розширювати automations/recurring/CPM

## P0 — Fix Immediately

### 1. Validate assignees and labels inside createTask

Проблема:
- `createTask()` напряму пише `assigneeIds` і `labelIds`
- тут немає тієї ж перевірки, що є в `addAssignee()` і `attachLabel()`

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:259)

Що зробити:
- перед `tx.taskAssignee.createMany()` перевірити, що всі `assigneeIds` мають task access у цьому project
- перед `tx.taskLabelAssignment.createMany()` перевірити, що всі `labelIds` належать цьому project
- якщо є хоча б один invalid id, повертати `400`

Бажаний результат:
- create flow не може обійти permission/ownership checks
- усі шляхи додавання assignee/label поводяться однаково

### 2. Закрити checklist mutation для read-only users

Проблема:
- `toggleChecklistItem()` вимагає лише `canViewTasks`
- це дозволяє користувачам з read-only task access змінювати стан checklist item

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:797)

Що зробити:
- замінити guard на edit-capable policy
- дозволяти toggle лише:
  - `canEditAnyTask`
  - owner + `canEditOwnTasks`
  - assignee task, якщо це ваша intended policy
  - checklist assignee, якщо це ваша intended policy

Бажаний результат:
- `VIEWER` і будь-який read-only user не може міняти checklist

### 3. Закрити витік time/cost data через task logs

Проблема:
- `listTaskLogs()` перевіряє лише `canViewTasks`
- route повертає повні time logs, включно з `hourlyRateSnapshot` і `costSnapshot`

Файли:
- [src/lib/time/timer.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/time/timer.ts:254)
- [src/app/api/admin/tasks/[taskId]/time/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/tasks/[taskId]/time/route.ts:1)

Що зробити:
- ввести окремий permission check для task time visibility
- мінімум:
  - `canViewTasks` для базового access
  - `canViewTimeReports` для перегляду логів
  - `canViewCostReports` для `hourlyRateSnapshot` / `costSnapshot`
- повертати sanitized DTO, а не raw Prisma rows

Бажаний результат:
- cost/time visibility відповідає access model
- task drawer не стає обходом reports permissions

### 4. Вирівняти self-unassign policy

Проблема:
- `removeAssignee()` дозволяє self-unassign без чіткої policy моделі

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:637)

Що зробити:
- явно визначити політику:
  - або self-unassign дозволений завжди для поточного assignee
  - або лише якщо user має edit rights на task
- після цього реалізувати guard явно, а не через побічний вираз

Бажаний результат:
- поведінка зрозуміла і передбачувана

## P1 — Remove Duplication And Policy Drift

### 5. Об’єднати comments API або зробити один canonical path

Проблема:
- є два API для коментарів:
  - task-scoped route
  - generic comments route
- вони мають різні response shapes і різний error handling

Файли:
- [src/app/api/admin/tasks/[taskId]/comments/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/tasks/[taskId]/comments/route.ts:1)
- [src/app/api/admin/comments/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/comments/route.ts:1)

Що зробити:
- вибрати canonical API
- другий route або видалити, або зробити thin wrapper з однаковим response contract
- уніфікувати:
  - auth
  - response shape
  - error mapping
  - cache keys у frontend

Бажаний результат:
- немає drift між двома task comments endpoints

### 6. Винести privacy guard у shared helper

Проблема:
- логіка private task visibility дублюється в `listTasks()` і `searchTasks()`

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:111)
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:845)

Що зробити:
- створити helper на кшталт `applyTaskPrivacyScope(where, ctx, currentUserId)`
- використовувати його в list/search/export/other task queries

Бажаний результат:
- одна модель private visibility для всіх task query paths

### 7. Вирівняти feature gate і scope policy для automations/webhooks

Проблема:
- `automations GET` перевіряє tasks feature flag, `POST` — ні
- `webhooks` не мають аналогічного gate
- в обох routes змішані project-scoped і global entities

Файли:
- [src/app/api/admin/projects/[id]/automations/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/automations/route.ts:19)
- [src/app/api/admin/projects/[id]/webhooks/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/webhooks/route.ts:13)

Що зробити:
- визначити policy:
  - чи project managers можуть бачити global automations/webhooks
  - чи global entities доступні лише super admin
- зробити єдиний helper для scope filtering
- зробити однаковий feature gate policy

Бажаний результат:
- немає витоку global config у project-level API

### 8. Прибрати або задіяти мертвий helper notifyTaskCreatedToProject

Проблема:
- helper існує, але не використовується
- фактична поведінка не відповідає обіцяному `TASK_CREATED` fanout

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:1000)

Що зробити:
- або викликати його з `createTask()`
- або видалити і не тримати мертвий код
- окремо звірити notification taxonomy

Бажаний результат:
- або `TASK_CREATED` реально працює
- або код не вводить в оману

## P2 — Consistency And UX Hardening

### 9. Переробити reorderTask на справжній column reorder

Проблема:
- зараз оновлюється лише одна задача
- сусідні картки не реіндексуються

Файл:
- [src/lib/tasks/service.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/service.ts:960)

Що зробити:
- робити reorder у транзакції
- перераховувати порядок задач у старій і новій колонці
- або перейти на gap-based ordering

Бажаний результат:
- стабільний Kanban порядок без дубльованих `position`

### 10. Довести manual time logs до рівня timer lifecycle

Проблема:
- `createManualLog()` не має того ж audit/realtime/notification рівня, що start/stop

Файл:
- [src/lib/time/timer.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/time/timer.ts:169)

Що зробити:
- додати audit log
- вирішити, чи потрібен realtime refresh
- вирівняти DTO і side effects з іншими time mutations

Бажаний результат:
- ручні логи і timer logs поводяться однаково з погляду системи

### 11. Валідувати shape saved views

Проблема:
- `filtersJson`, `columnsJson`, `groupBy`, `sortBy` майже не перевіряються

Файл:
- [src/app/api/admin/projects/[id]/views/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/views/route.ts:74)

Що зробити:
- ввести schema validation для `filtersJson`
- allow-list для `groupBy`, `sortBy`, columns
- додати `version` у saved view payload

Бажаний результат:
- views не ламаються при еволюції DSL/custom fields

### 12. Розширити task export або явно обмежити його scope

Проблема:
- export зараз дуже базовий і не покриває частину task model

Файл:
- [src/app/api/admin/projects/[id]/tasks/export/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/tasks/export/route.ts:1)

Що зробити:
- вирішити, це MVP export чи production export
- якщо production:
  - додати checklist summary
  - dependencies
  - custom fields
  - optional time metrics
  - role-aware masking

Бажаний результат:
- export відповідає очікуванням бізнесу

## P3 — Structural Improvement

### 13. Ввести єдиний policy layer для task mutations

Проблема:
- зараз правила доступу розкидані по багатьох mutation functions
- через це вже є drift між create/update/checklist/time/comments

Що зробити:
- створити helpers:
  - `assertCanEditTask(task, actorId, ctx)`
  - `assertCanAssignUsers(task, actorId, ctx)`
  - `assertCanMutateChecklist(task, actorId, ctx)`
  - `assertCanViewTaskLogs(task, actorId, ctx)`
  - `assertCanViewTaskCosts(task, actorId, ctx)`

Бажаний результат:
- доступи не роз’їжджаються між різними endpoints

### 14. Ввести DTO layer для task/time/comments responses

Проблема:
- частина route handlers віддає майже raw objects
- shape responses не всюди стабільний

Що зробити:
- створити server mappers:
  - `toTaskListDTO`
  - `toTaskDetailDTO`
  - `toTaskTimeLogDTO`
  - `toCommentDTO`
- маскування і нормалізацію перенести туди

Бажаний результат:
- route handlers тонкі, правила формату не дублюються

## Recommended Work Order

1. `createTask()` validation parity
2. checklist permissions
3. task time log permissions + cost masking
4. self-unassign policy
5. comments API consolidation
6. privacy helper extraction
7. automations/webhooks scope policy
8. reorder transaction logic
9. manual time logs consistency
10. saved views validation
11. export scope decision
12. shared policy + DTO layers

## Definition Of Done

Вважати модуль стабілізованим після того, як:

- немає обходу permissions через create/checklist/time endpoints
- comments API не дублює поведінку
- private task visibility реалізована одним правилом
- automations/webhooks мають прозорий scope policy
- kanban reorder не створює конфліктів позицій
- time logs не показують cost тим, хто не має на це права
- response contracts стали передбачуваними

## Note

Після завершення цього плану вже має сенс:

- поглиблювати automations UI
- доробляти recurring UX
- підсилювати critical path до повного CPM
- розширювати client/guest task model, якщо це буде продуктова ціль
