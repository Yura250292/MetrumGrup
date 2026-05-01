# Phase 3 — Sync redesign

**Статус:** Drafting (потребує UX-вибору перед імплементацією)
**Залежить від:** Phase 1, 2, 4, 5, 6 — всі закриті у [ADR-0001](./ADR-0001-financing-projects-canonical-source.md)
**Контекст:** Phase 3 з [`FINANCING_PROJECTS_INTEGRATION_IMPROVEMENT_PLAN.md`](../FINANCING_PROJECTS_INTEGRATION_IMPROVEMENT_PLAN.md)

---

## Що болить зараз

Сьогодні sync derived-шару з canonical (stage tree) працює на **ручній кнопці**: користувач має натиснути «Зберегти у фінансування» (`POST /api/admin/projects/[id]/sync-stages-finance`).

Проблеми:

1. **Користувач забуває натиснути.** Він редагує stage tree (planVolume / planUnitPrice), думає що зробив роботу, але STAGE_AUTO записи у фінансовому журналі не оновлюються. Через тиждень бухгалтер дивиться summary і бачить старі цифри.

2. **«Між кроками» — легальний неузгоджений стан.** Stage tree уже змінено, derived проєкція ще ні. Звіти, які беруть план зі stage tree, і звіти, які беруть із STAGE_AUTO FinanceEntry, показують різні цифри **в один і той самий момент**.

3. **Автоматичної видимості dirty-state у UI немає.** Ми вже реалізували endpoint `/api/admin/finance-diagnostics/projection-status` і audit-сторінку — користувач **може** піти й побачити список «застарілих». Але у звичайному робочому потоці ніщо не сигналізує: «у тебе є непублікована зміна».

4. **Ручний sync — це не повноцінна `publish`-операція.** Немає версії, немає коментаря, немає можливості зробити «чернетку» і потім опублікувати все разом. Усе або синхронізовано, або ні.

## Що має дати Phase 3

Звести систему до правила: **«derived-шар — або автоматично актуальний, або очевидно неактуальний»**. Усунути ситуації «забув натиснути» і «звіти показують різне». 

---

## Два варіанти рішення

### Варіант A — Auto-projection («автомат після кожної зміни»)

**Ідея:** Будь-яка зміна `ProjectStageRecord.planVolume / planUnitPrice / planClientUnitPrice / factVolume / factUnitPrice / factClientUnitPrice` одразу запускає `syncStageAutoFinanceEntries` для цього стейджу. Кнопки «Зберегти у фінансування» більше немає.

**Що змінюється:**

- `PATCH /api/admin/projects/[id]/stages/[stageId]` — **викликає** `syncStageAutoFinanceEntries(stageId)` після успішного запису, інакше повертає помилку (atomic).
- Bulk-stage update endpoint — викликає `syncStageAutoFinanceEntries` для кожного зміненого стейджу.
- Existing `POST /sync-stages-finance` залишається для ручного «відновити з канонікалу» (recovery), але стає рідкісним.
- `markProjectProjected` працює як зараз.

**Плюси:**

- Простота для користувача — нема двох кроків. Stage tree є фінансовим планом.
- Звіти ніколи не розходяться з UI.
- `dirty`-state взагалі не існує.

**Мінуси:**

- Втрата «чернеткового» режиму. Якщо менеджер експериментує (підняв ціну → передумав → опустив назад), кожна зміна вже у фінансовому журналі. Немає «зберегти-як-чернетку».
- Кожен PATCH стейджу — додаткові 4 upsert у `FinanceEntry` + recompute planSource + bump projection version. На bulk-paste з Excel у 200 рядків це 800+ записів і 200+ updates на Project.
- Якщо bulk-API не транзакційний — між рядками може бути «напіврозрахований» стан фінансового журналу.

### Варіант B — Draft / Published («дві версії»)

**Ідея:** Stage tree має дві колонки даних: чорнові (`planVolume`, які користувач редагує) і опубліковані (`publishedPlanVolume`, які бачить фінансовий журнал). Кнопка «Опублікувати» переписує опубліковані поля з чорнових і запускає `syncStageAutoFinanceEntries`.

**Що змінюється:**

- Schema `ProjectStageRecord`: додаються `publishedPlanVolume`, `publishedPlanUnitPrice`, `publishedPlanClientUnitPrice`, `publishedFactVolume`, `publishedFactUnitPrice`, `publishedFactClientUnitPrice` (всі `Decimal?`).
- Schema `Project`: `lastPublishedAt`, `lastPublishedById`, `publicationVersion` (ми вже маємо схожий `lastProjectedAt` — можна перейменувати, або жити з обома).
- `syncStageAutoFinanceEntries` читає `published*` поля, не чорнові.
- `computeSummary` і всі звіти — теж зчитують `published*`.
- UI у stage tree показує badge «Не опубліковано», коли `planVolume !== publishedPlanVolume`.
- Кнопка «Опублікувати» (тут вона має сенс) — повноцінна publish-операція з підтвердженням, опційним коментарем, version bump.
- Existing `/sync-stages-finance` стає `/publish-stages-finance` — це і є publish.

**Плюси:**

- Користувач може експериментувати у stage tree без побічних ефектів на фінансовий журнал.
- Атомарний publish — усі зміни «потрапляють у фінанси» в одну мить.
- Аудиторський слід (`publicationVersion + lastPublishedById + опційний коментар`) — корисно для бухгалтерії.
- Наочний dirty-state у UI.

**Мінуси:**

- 6 нових колонок у `ProjectStageRecord` + міграція з backfill (`published* := план/факт*`).
- Уся читальна логіка (звіти, summary, budget-vs-actual, графіки на сторінці проєкту) має переключитися на `published*`. Це багато місць.
- Початкові N тижнів по запуску буде розгубленість: «чому я редагую, а у фінансах не змінюється?» — потребує onboarding підказки.
- Якщо користувач забуде опублікувати — той самий «застарілий стан», що ми маємо зараз. Тільки тепер його видно у самому stage tree (а не лише в окремому audit-дашборді).

---

## Порівняння у двох рядках

| | Варіант A (auto) | Варіант B (draft/publish) |
|---|---|---|
| Що бачить менеджер у stage tree | One column | Чорнова + опублікована |
| Що бачить фінансист у журналі | Завжди свіже | Те, що менеджер опублікував |
| Кнопка «Зберегти у фінансування» | Зникає (recovery only) | Стає «Опублікувати» (атомарна publish) |
| Звіти і UI узгоджені? | Так, бо одне джерело | Так, бо всі зчитують `published*` |
| Може користувач експериментувати без сторонніх ефектів? | Ні | Так |
| Складність міграції | Низька | Середня (6 колонок + рефакторинг звітів) |

---

## Рекомендація

**Варіант B (draft/publish).** Хоч він і важчий, він стратегічно правильніший:

1. Метрум працює з підрядниками і бухгалтерією, де **передбачуваність** plan-даних важливіша за швидкість редагування. Випадкова зміна ціни в плані не повинна одразу створювати фінансовий запис, який бухгалтер потім питає «звідки він зʼявився».
2. Аудиторський слід (`publicationVersion`) — це те, що рано чи пізно попросить ERP-інтеграція або автоматизація рахунків КБ-2.
3. Варіант A веде до проблеми: при bulk-edit у 200 рядків через Excel-paste кожна правка — окрема projection. Зробити це atomically важко, transactional latency може стати проблемою.
4. Ми вже маємо інфраструктуру (`projectionVersion`, `lastProjectedAt`, `markProjectProjected`) — варіант B природньо розширює її, не ламає.

Якщо є аргумент швидко закрити user-pain «забув натиснути sync» з мінімальними змінами — варіант A. Але це тимчасове рішення.

---

## Розбивка на subphases (для Варіанту B)

### 3.1 — Schema + міграція
- Додати `publishedPlanVolume`, `publishedPlanUnitPrice`, `publishedPlanClientUnitPrice`, `publishedFactVolume`, `publishedFactUnitPrice`, `publishedFactClientUnitPrice` (Decimal?).
- Міграція: backfill `published* := *` для всіх існуючих стейджів — щоб поточний стан був «вже опублікований».
- Уже маємо `lastProjectedAt / lastProjectedById / projectionVersion` — переіменувати в `lastPublishedAt / lastPublishedById / publicationVersion` (не обовʼязково, але семантично точніше).

### 3.2 — Read-side switch
- `syncStageAutoFinanceEntries` читає `published*` поля.
- `computeSummary` та інші агрегатори — без змін, бо вони працюють з FinanceEntry (а ті оновлюються тільки на publish).
- Усі UI, які показують план/факт стейджу для фінансових звітів (budget-vs-actual, graph cards), переключити на `published*`.
- Stage tree редактор (overview tab) — лишається на чорнових (`planVolume`/`factVolume`). Це той самий шаблон, що в багатьох CRM (draft email vs sent).

### 3.3 — Publish API + dirty detection
- `POST /api/admin/projects/[id]/publish-stages-finance` — копіює всі `*` у `published*` атомарно (одна транзакція), запускає `syncStageAutoFinanceEntries` для кожного стейджу, bump-ить `publicationVersion`. Опційно приймає `comment` у body — пишемо в `auditLog`.
- API повертає скільки стейджів змінилося, які саме. UI показує summary («Опубліковано 12 стейджів, 3 з них уперше»).
- Dirty detection: stage є dirty, якщо хоч одне з полів (`planVolume / planUnitPrice / planClientUnitPrice / factVolume / factUnitPrice / factClientUnitPrice`) ≠ свого `published*`.
- API endpoint `GET /api/admin/projects/[id]/dirty-stages` — повертає список dirty-стейджів для конкретного проєкту (це окремий рівень granularity до того, що дає `/projection-status`).

### 3.4 — UI: dirty badges + publish flow
- У stage tree (overview tab) кожен dirty-стейдж має точку/badge «Не опубліковано».
- На рівні проєкту, якщо є хоч один dirty-стейдж — кнопка «Опублікувати у фінансування» активна, з лічильником («Опублікувати 7 змін»).
- Клік → діалог з:
  - превʼю змін (старе → нове по кожному стейджу),
  - опційний коментар,
  - confirm.
- Існуючий `/admin-v2/financing/audit` уже показує `dirty` projects — він просто продовжує працювати, лише на іншому проксі-полі.

### 3.5 — Migration of existing flows
- Bulk-paste у stage tree (Excel) — пише у чорнові, не у published. UI показує «N не опубліковано».
- AI-розбір кошторису → стейджі (`syncEstimateToStages`) — ставить чорнові поля, **залишає published порожніми**, потім авто-publish (бо це новий проєкт, нема що ламати). Або робити це як explicit publish — питання UX.
- Існуючий `/sync-stages-finance` стає тонкою обгорткою над publish-endpoint-ом для зворотньої сумісності API.

### 3.6 — Tests
- Unit: dirty-detection, publish atomicity, recompute після publish.
- Integration: stage edit → dirty → publish → STAGE_AUTO оновлено + summary змінився.

---

## Ризики

1. **Регресія у звітах.** Якщо хоча б одне місце забудеться переключитися на `published*` — буде «у одному екрані одна цифра, у другому інша». Mitigation: типи Prisma зроблять `planVolume` опційним для read-shape — компілятор не дасть забути.
2. **Onboarding шок.** Поточні користувачі звикли «змінив — і одразу у фінансах». Mitigation: на першому запуску після мерджу всі існуючі стейджі мають `published* = *` (no-op публікація). Користувачі побачать новий behavior лише при редагуванні.
3. **Latency на publish.** 200 стейджів × 4 upserts FinanceEntry + bump = ~800+ DB операцій. Mitigation: Prisma transaction + batched writes; якщо стає вузьким горлом — `prisma.$executeRawUnsafe` для копіювання `* → published*`.

---

## Не входить у Phase 3

- Уніфікація `Project.totalBudget` з `published*`. Залишається rollup-кешем як зараз.
- Зміна моделі `PROJECT_BUDGET` FinanceEntry. Він і так уже derived/read-only.
- Зміна RBAC. Publish-роль = canPublishFinance, що уже визначено.

---

## Що від тебе для старту імплементації

1. **Підтвердження Варіанту B** (або вибір A якщо не погоджуєшся з рекомендацією).
2. **Чи перейменовувати `lastProjectedAt → lastPublishedAt`** (косметика, але зачищає термінологію).
3. **Чи треба коментар при публікації** як обовʼязкове поле, опційне, або взагалі без нього.
4. **Що робити з AI-кошторис → stage** flow — авто-publish при первинному імпорті, чи завжди як draft?

Без цих 4 відповідей імплементацію не починаємо.
