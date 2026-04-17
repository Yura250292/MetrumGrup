# Tasks Module Fixes

Цей файл фіксує, що саме потрібно виправити або довести в task-модулі після звірки поточної реалізації з roadmap і порівняння з Worksection.

## P0

- Виправити `TASK` у фронтовому comments hook.
  Зараз Prisma/schema і backend already support `CommentEntityType.TASK`, але фронтовий тип у [src/hooks/useComments.ts](/Users/admin/Igor-Shiba/metrum-group/src/hooks/useComments.ts:5) досі має лише `"ESTIMATE" | "PROJECT"`.
  Наслідок: task comments типізовано неповно і це може ламати або стримувати UI для коментарів по задачах.

- Перевірити end-to-end reuse comments UI для задач.
  Після додавання `TASK` у hook треба пройти весь ланцюг: thread render, post, delete, reactions, cache invalidation, optimistic updates.

## P1

- Визначити продуктову політику доступу для clients/guests.
  Зараз у [src/lib/projects/access.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/projects/access.ts:73) задачі повністю hard-block для `CLIENT`.
  Це свідомо відрізняється від Worksection, де є зовнішні ролі, guest/reader доступ і приватність задач.
  Треба вирішити одне з двох:
  або залишаємо internal-only tasks і не намагаємось копіювати Worksection у цій частині,
  або додаємо окрему модель зовнішнього доступу до задач.

- Якщо потрібен паритет з Worksection, додати visibility/access model для задач.
  Мінімальний обсяг:
  `canViewOwnAssignedTasks`
  `canCommentOnVisibleTasks`
  `canViewTaskFiles`
  `isPrivate` + allow-list users/members
  окремі правила для client/guest/reader.

- Дотягнути personal dashboard до рівня daily planner.
  База вже є у [src/app/admin-v2/me/_components/me-dashboard.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/me/_components/me-dashboard.tsx:1), але ще бракує більш сильного execution UX:
  швидкі дії з задачами
  фокус на today/overdue/next
  кращий зв’язок з активним таймером
  зручний вхід у конкретну задачу, а не лише у project tasks tab.

## P2

- Підсилити critical path до повного CPM.
  Поточна реалізація в [src/lib/tasks/dependencies.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/dependencies.ts:145) прямо позначена як simplified longest-path.
  Для будівельного use case бажано перейти до повного розрахунку:
  ES/EF/LS/LF
  total float / free float
  коректний облік типів `FS/SS/FF/SF`
  лагів як календарних або робочих днів за визначеним правилом.

- Уточнити поведінку recurring tasks.
  Поточна логіка в [src/lib/tasks/recurring.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/tasks/recurring.ts:18) спавнить задачі через cron з horizon 24h.
  Треба зафіксувати продуктове правило:
  spawn наперед за розкладом
  або spawn після завершення попередньої
  або підтримувати обидва режими.
  Також треба явно вирішити:
  чи копіюється checklist
  чи копіюються subtasks
  як обробляються overdue recurring instances
  що відбувається при ручному редагуванні шаблону.

- Довести automations від schema-level до production UX.
  Поточний engine у [src/lib/automations/engine.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/automations/engine.ts:1) вже працює, але сам себе описує як minimal automation engine.
  Потрібно:
  нормальний builder для conditions/actions
  preview/debug mode
  ручний test run
  history UI по `AutomationRunLog`
  чіткі validation rules для payload fields.

- Перевірити відповідність trigger naming між roadmap і кодом.
  У roadmap є `STATUS_CHANGED` / `DUE_APPROACHING`, у schema зараз `TASK_STATUS_CHANGED` / `TASK_DUE_APPROACHING`.
  Потрібно прибрати будь-яку неоднозначність у документації, UI і API contracts.

## P3

- Розширити reports UX.
  API для time/workload уже є, cost masking теж є:
  [src/app/api/admin/projects/[id]/reports/time/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/reports/time/route.ts:1)
  [src/app/api/admin/projects/[id]/reports/workload/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/projects/[id]/reports/workload/route.ts:1)
  Але треба перевірити, що UI повністю покриває 7/30/90 днів, cost visibility, workload balancing і export сценарії.

- Перевірити saved views/filter DSL на безпечний allow-list.
  Потрібен окремий review на:
  дозволені поля
  оператори
  сортування
  shared views
  backward compatibility при зміні custom fields/statuses.

- Дотягнути task file flow.
  Модель через `ProjectFile` + `TASK_ATTACHMENT` правильна, але треба перевірити UX:
  upload from task drawer
  list attachments inside task
  permissions
  delete behavior
  audit trail.

- Перевірити notification coverage для всіх task events.
  Звірити roadmap типи:
  `TASK_ASSIGNED`
  `COMMENTED`
  `STATUS_CHANGED`
  `DUE_SOON`
  `CREATED`
  з фактичними callsites і глибинами fanout.

- Перевірити audit coverage для кожної task mutation.
  Потрібен окремий audit review:
  create/update/archive/delete
  assignee changes
  label changes
  checklist changes
  dependencies
  timer start/stop
  bulk actions.

## Product Positioning

- Якщо ціль саме "конкурувати з Worksection", найбільший gap зараз не в schema, а в access model і polish.
- Якщо ціль "внутрішній staff-only execution layer", поточна архітектура вже добра, і тоді головний фокус має бути на стабілізації UI, recurring, automations, reports і comments integration.

## Recommended Order

1. Додати `TASK` у `useComments.ts` і пройти end-to-end comments QA.
2. Формально вирішити policy для `CLIENT`/guest доступу до задач.
3. Зафіксувати продуктову специфікацію recurring tasks.
4. Дотягнути automations UI + run logs + validation.
5. Підсилити critical path до повного CPM або чесно залишити як MVP.
6. Провести окремий review notifications/audit/reports/files.
