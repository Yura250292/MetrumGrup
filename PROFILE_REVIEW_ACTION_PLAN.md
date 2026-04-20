# Profile Review Action Plan

Цей файл фіксує, що саме потрібно виправити і покращити в поточній реалізації сторінки профілю.

Мета:

- зробити профіль технічно коректним
- прибрати розсинхрон між API і UI
- довести hooks/buttons до стабільної роботи
- зробити профіль реальним control center, а не лише красивою формою

## Current State Summary

Що вже є:

- сторінка `/admin-v2/profile`
- profile data API
- секції:
  - основне
  - аватар
  - про мене
  - роль і повноваження
  - сповіщення
  - робочі налаштування
  - час і продуктивність
  - безпека

Що не ок:

- state профілю після save не завжди коректний
- частина полів існує лише частково
- avatar формально “обов’язковий”, але не enforced
- shell UI не використовує avatar
- частина API приймає сирий JSON без валідації

## P0 — Fix Immediately

### 1. Повернути повний DTO з `PATCH /api/admin/profile`

Проблема:

- після `PATCH /api/admin/profile` API повертає:
  - `teams: []`
  - `projectRoles: []`
- хук `useProfile()` повністю заміняє profile state цим урізаним об’єктом

Файли:

- [src/app/api/admin/profile/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/route.ts:178)
- [src/app/admin-v2/profile/_lib/use-profile.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_lib/use-profile.ts:30)

Що зробити:

- `PATCH /api/admin/profile` має повертати той самий повний shape, що і `GET /api/admin/profile`
- не повертати порожні `teams/projectRoles`

Бажаний результат:

- після save секція `Роль і повноваження` не ламається
- profile state не деградує

### 2. Після mutation робити canonical refetch профілю

Проблема:

- зараз hook локально патчить частину state
- через це `profileCompleteness`, `teams`, `projectRoles` та інші derived values роз’їжджаються

Файл:

- [src/app/admin-v2/profile/_lib/use-profile.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_lib/use-profile.ts:1)

Що зробити:

- після успішних:
  - `updateProfile`
  - `uploadAvatar`
  - `deleteAvatar`
  - `updateNotifications`
  - `updatePreferences`
  викликати `fetchProfile()`

Бажаний результат:

- сторінка завжди відображає canonical server state

### 3. Перераховувати `profileCompleteness` для avatar/notifications/preferences

Проблема:

- completeness рахується лише в `GET/PATCH /api/admin/profile`
- avatar/notification/preferences routes не повертають оновлений completeness

Файли:

- [src/app/api/admin/profile/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/route.ts:70)
- [src/app/api/admin/profile/avatar/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/avatar/route.ts:15)
- [src/app/api/admin/profile/notifications/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/notifications/route.ts:6)
- [src/app/api/admin/profile/preferences/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/preferences/route.ts:6)

Що зробити:

- або всі mutation routes мають повертати повний updated profile DTO
- або client після них завжди робить refetch

Бажаний результат:

- summary card не показує застарілий % профілю

### 4. Визначити і реалізувати policy для обов’язкового avatar

Проблема:

- UI каже, що avatar обов’язковий
- але його можна видалити
- немає жодного blocking flow

Файли:

- [src/app/admin-v2/profile/_components/section-avatar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_components/section-avatar.tsx:88)
- [src/app/api/admin/profile/avatar/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/avatar/route.ts:95)

Що зробити:

обрати один з варіантів:

- або avatar truly required:
  - заборонити delete без replace
  - показувати blocking completeness state
- або прибрати твердження “обов’язковий” і залишити як strongly recommended

Бажаний результат:

- policy і фактична поведінка збігаються

## P1 — Make It Correct In Real UX

### 5. Використовувати реальний avatar у header і sidebar

Проблема:

- навіть після upload avatar у header/sidebar показується лише ініціал

Файли:

- [src/app/admin-v2/_components/header.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/header.tsx:100)
- [src/app/admin-v2/_components/sidebar.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/_components/sidebar.tsx:136)

Що зробити:

- брати `session.user.image` або оновлюваний profile avatar
- показувати справжній avatar
- fallback лишати лише якщо avatar відсутній

Бажаний результат:

- profile avatar реально використовується у shell UI

### 6. Додати валідацію для notification settings

Проблема:

- `PATCH /api/admin/profile/notifications` приймає будь-який JSON

Файл:

- [src/app/api/admin/profile/notifications/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/notifications/route.ts:6)

Що зробити:

- додати schema validation:
  - дозволені channels
  - дозволені categories
  - `quietHours`
  - `mode`
  - `weekendQuiet`

Бажаний результат:

- у БД не потрапляє битий notification JSON

### 7. Додати валідацію для preferences

Проблема:

- `PATCH /api/admin/profile/preferences` приймає майже будь-який shape

Файл:

- [src/app/api/admin/profile/preferences/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/preferences/route.ts:6)

Що зробити:

- schema validation для:
  - `workPrefsJson`
  - `productivityPrefsJson`
- обмеження на:
  - `dailyHourNorm`
  - valid weekdays
  - valid time strings
  - boolean flags

Бажаний результат:

- preferences зберігаються у передбачуваній формі

### 8. Закрити race conditions в autosave notification toggles

Проблема:

- у `SectionNotifications` кожен toggle одразу шле save
- при швидких кліках можливі race conditions

Файл:

- [src/app/admin-v2/profile/_components/section-notifications.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_components/section-notifications.tsx:25)

Що зробити:

- або debounce save
- або optimistic update + request queue
- або перейти на explicit save bar

Бажаний результат:

- швидкі зміни не дають непередбачуваного фінального state

## P2 — Finish Missing Pieces

### 9. Доробити повний UI для notification channels

Проблема:

- у типах є:
  - `channels`
  - `quietHours`
  - `weekendQuiet`
- але в UI редагуються лише category toggles

Файли:

- [src/app/admin-v2/profile/_lib/types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_lib/types.ts:1)
- [src/app/admin-v2/profile/_components/section-notifications.tsx](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_components/section-notifications.tsx:18)

Що зробити:

- додати:
  - master toggles for channels
  - `quiet hours`
  - `weekend quiet`
  - mode selector

Бажаний результат:

- notification settings відповідають заявленій моделі

### 10. Доробити `workPrefsJson` як окрему частину UI

Проблема:

- тип `WorkPrefs` існує
- API для нього є
- але окремого UX майже немає

Файли:

- [src/app/admin-v2/profile/_lib/types.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/admin-v2/profile/_lib/types.ts:18)
- [src/app/api/admin/profile/preferences/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/preferences/route.ts:15)

Що зробити:

- додати controls для:
  - `showTimerPill`
  - `autoOpenActiveTasks`
  - `defaultProjectId`

Бажаний результат:

- робочі preferences стають реально корисними

### 11. Обробити користувачів без локального пароля

Проблема:

- security route очікує, що `user.password` існує завжди

Файл:

- [src/app/api/admin/profile/security/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/profile/security/route.ts:28)

Що зробити:

- якщо локальний пароль відсутній:
  - повернути нормальну бізнес-помилку
  - або приховати блок зміни пароля для таких користувачів

Бажаний результат:

- route не падає на edge-case auth models

### 12. Додати success/error consistency у всіх секціях

Проблема:

- різні секції по-різному поводяться після save
- немає єдиної стратегії toast/inline success

Що зробити:

- визначити спільну модель:
  - inline success
  - toast
  - refetch
  - disabled states

Бажаний результат:

- усі кнопки `Зберегти` поводяться однаково

## P3 — Nice Improvements

### 13. Додати crop/preview flow для avatar

Поточний upload працює, але UX можна сильно покращити:

- crop before upload
- zoom
- preview
- replace existing

### 14. Додати profile completeness details

Зараз є лише %.

Покращення:

- список, чого саме не вистачає:
  - аватар
  - посада
  - bio
  - timezone
  - notifications

### 15. Додати інтеграцію profile settings у решту продукту

Після збереження:

- `defaultLandingPage` має реально впливати на post-login redirect
- `defaultTaskView` має реально застосовуватись у tasks pages
- `showTimerPill` має реально керувати `TimerPill`

Інакше це лише декоративні поля.

## Recommended Work Order

1. Повернення повного DTO з `PATCH /api/admin/profile`
2. Canonical refetch after every mutation
3. Completeness consistency
4. Avatar policy
5. Avatar usage в header/sidebar
6. Validation для notifications/preferences
7. Notification autosave stabilization
8. `workPrefsJson` UI completion
9. Security edge-cases
10. Product integration of saved preferences

## Definition Of Done

Вважати профіль стабілізованим після того, як:

- після будь-якого save/upload/delete UI показує повний актуальний profile state
- `teams/projectRoles/profileCompleteness` не роз’їжджаються
- avatar policy узгоджений з реальною поведінкою
- avatar видно у shell UI
- notification/preferences routes валідовані
- всі hooks/buttons працюють однаково передбачувано
- profile settings реально впливають на поведінку системи, а не лише зберігаються в БД
