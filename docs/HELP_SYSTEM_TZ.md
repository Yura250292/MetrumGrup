# Технічне Завдання: Help / Onboarding System для `admin-v2`

## 1. Призначення

Потрібно спроєктувати та реалізувати в `admin-v2` єдину систему onboarding/help для складного багатофункціонального інтерфейсу, щоб користувачі швидко розуміли:

- що це за розділ;
- для чого він потрібен;
- які дії тут доступні;
- з чого почати;
- як пройти ключовий сценарій без окремого навчання від менеджера.

Система має покривати не один "тур по меню", а кілька рівнів допомоги: короткий опис сторінки, контекстні підказки біля складних елементів, покрокові walkthrough для важливих сценаріїв і єдину точку входу до help-контенту.

## 2. Поточний контекст проєкту

У проєкті вже є:

- `admin-v2` layout: `src/app/admin-v2/layout.tsx`
- глобальний `header`: `src/app/admin-v2/_components/header.tsx`
- sidebar/nav registry: `src/app/admin-v2/_lib/nav.ts`
- існуюча механіка tutorial overlay: `src/components/ai-assistant/AiTutorial.tsx`
- portal для tutorial/panel: `src/components/ai-assistant/AiPanelPortal.tsx`

Висновок: нову систему потрібно будувати поверх існуючої структури `admin-v2`, по можливості перевикористовуючи `AiTutorial` engine, але відв'язавши help від AI-panel-only сценарію.

## 3. Ціль

Розробити універсальну UX-help систему для `admin-v2`, яка:

- зменшує когнітивне навантаження на нових і рідких користувачів;
- пояснює призначення складних розділів;
- дозволяє запускати тури по ключових флоу;
- централізує help-контент у конфігурації, а не розмазує тексти по сторінках.

## 4. Основна концепція

Help-система складається з 4 рівнів:

### 4.1. `Page Intro`

Короткий explanatory block на важливих сторінках.

Пояснює:

- що це за розділ;
- для кого він;
- які основні дії тут виконуються;
- з чого почати.

### 4.2. `Contextual Help`

Локальні підказки біля складних контролів, статусів, фільтрів, режимів, фінансових термінів.

### 4.3. `Guided Tours`

Покрокові walkthrough для критичних сценаріїв користувача.

### 4.4. `Help Center / Help Drawer`

Єдина точка входу через кнопку в header:

- опис поточної сторінки;
- список доступних сценаріїв;
- FAQ;
- посилання на тури;
- короткі інструкції.

## 5. Функціональний обсяг MVP

MVP має включати:

1. глобальну кнопку help у `admin-v2` header;
2. правобічний `Help Drawer` або modal-sheet;
3. route-based help registry;
4. `Page Intro Card` для важливих сторінок;
5. запуск route-specific tutorial/walkthrough;
6. збереження dismiss state у `localStorage`;
7. рольову/route-фільтрацію help-контенту;
8. підготовку архітектури під подальше масштабування.

## 6. Сторінки першої хвилі

Першою чергою реалізувати help-контент для таких розділів:

1. `/admin-v2/financing`
2. `/admin-v2/projects`
3. `/admin-v2/estimates`
4. `/admin-v2/foreman-reports`
5. `/admin-v2/meetings`
6. `/admin-v2/counterparties`
7. `/admin-v2/catalogs/materials`
8. `/admin-v2/receipts`

## 7. UX-вимоги

### 7.1. `HelpButton`

У header додати кнопку `?` або `Help`.

При натисканні відкривається `Help Drawer` для поточного route.

### 7.2. `Help Drawer`

Drawer показує:

- назву поточного розділу;
- 1 короткий summary;
- блок "Що тут можна зробити";
- блок "З чого почати";
- список сценаріїв "Запустити тур";
- FAQ для сторінки;
- можливе посилання "Показати підказки на сторінці".

### 7.3. `Page Intro`

На ключових сторінках у верхній частині контенту показувати dismissible-card:

- назва розділу;
- 1-2 речення пояснення;
- 3-4 bullets ключових дій;
- CTA:
  - `Почати тур`
  - `Детальніше`
  - `Більше не показувати`

Показувати:

- автоматично на першому відкритті сторінки;
- або після великих змін функціоналу;
- або вручну через Help Drawer.

### 7.4. `Guided Tours`

Тури мають бути не "по меню", а по задачах:

- "Як додати фінансовий запис"
- "Як завантажити кошторис"
- "Як створити проєкт"
- "Як обробити заявку виконроба"

Для кожного туру:

- 3-7 кроків;
- фокус на результаті;
- селектори мають бути стабільними;
- для цього в UI треба додати `data-tour-id` / `data-help-id` на цільові елементи.

### 7.5. `Contextual Help`

Складні місця інтерфейсу повинні підтримувати:

- icon-trigger `i` / `?`;
- tooltip/popover;
- короткий текст 1-3 речення;
- без перевантаження сторінки зайвими поясненнями.

Help потрібен не всюди, а лише на складних місцях:

- фінансові режими;
- типи сутностей;
- класифікації;
- неочевидні фільтри;
- AI-інструменти;
- ризикові дії.

## 8. Нефункціональні вимоги

1. Не ламати існуючу навігацію і layout `admin-v2`.
2. Не прив'язувати help-логіку жорстко до AI assistant.
3. Увесь help-контент має бути централізований.
4. Компоненти мають бути повторно використовувані.
5. Має бути support для mobile і desktop.
6. Потрібно врахувати `dismissed`/`completed` state користувача.
7. Врахувати `prefers-reduced-motion`.
8. Не показувати автотури агресивно при кожному відкритті.

## 9. Архітектура рішення

Рекомендована структура:

```text
src/
  app/admin-v2/
    _components/help/
      HelpButton.tsx
      HelpDrawer.tsx
      PageIntroCard.tsx
      ContextHelp.tsx
      HelpTourLauncher.tsx
    _lib/help/
      registry.ts
      types.ts
      storage.ts
      selectors.ts
      helpers.ts
```

## 10. Типи даних

Створити централізований registry з типами приблизно такого вигляду:

```ts
export type HelpRole =
  | "SUPER_ADMIN"
  | "OWNER"
  | "MANAGER"
  | "ENGINEER"
  | "FINANCIER"
  | "HR"
  | "FOREMAN"
  | "CLIENT";

export type HelpFaqItem = {
  question: string;
  answer: string;
};

export type HelpAction = {
  label: string;
  href?: string;
  action?: "start-tour" | "scroll-to-section" | "open-modal";
  targetId?: string;
  tourId?: string;
};

export type HelpTourStep = {
  selector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
};

export type HelpTour = {
  id: string;
  title: string;
  description: string;
  steps: HelpTourStep[];
};

export type PageHelpConfig = {
  route: string;
  title: string;
  summary: string;
  audience?: HelpRole[];
  jobsToBeDone: string[];
  firstSteps: string[];
  faq?: HelpFaqItem[];
  actions?: HelpAction[];
  tours?: HelpTour[];
  intro?: {
    enabled: boolean;
    dismissKey: string;
    version: number;
  };
};
```

## 11. Help Registry

Потрібно створити централізований `registry.ts`, де для кожного важливого route визначається help-config.

Приклад для `financing`:

- назва;
- короткий опис;
- ключові сценарії;
- FAQ;
- тури;
- intro card config.

Registry має використовуватись у:

- header help drawer;
- page intro rendering;
- tour launcher;
- AI/глобальному пошуку в майбутньому.

## 12. Збереження стану

Реалізувати `localStorage`-механіку для:

1. dismiss page intro
2. completed tour
3. manually hidden help prompts

Ключі зробити versioned, наприклад:

- `help:intro:/admin-v2/financing:v1`
- `help:tour:add-finance-entry:completed:v1`

При зміні help-контенту можна підняти `version`, щоб знову показати intro.

## 13. Route integration

У `admin-v2` layout або спільному shell:

- додати `HelpProvider` або легкий state-controller;
- передати доступ до current route;
- забезпечити відкриття help drawer з header.

У `header.tsx`:

- додати кнопку `HelpButton`.

На сторінках:

- підключити `PageIntroCard` через registry;
- не дублювати руками тексти в кожній page-компоненті, якщо це можна зробити через спільний wrapper/helper.

## 14. Reuse існуючого tutorial engine

Поточний `src/components/ai-assistant/AiTutorial.tsx` можна використати як базу, але потрібно:

1. відокремити tutorial-типи від AI-конкретики;
2. прибрати жорстку залежність від сценаріїв `admin/manager/marketer`;
3. перенести загальний engine у neutral-компонент, наприклад:
   `components/help/GuidedTour.tsx`
4. сценарії турів зберігати в help registry, а не всередині компонента.

Якщо повний refactor завеликий для MVP, допускається:

- тимчасово перевикористати `AiTutorial`;
- але обов'язково винести сценарії і launch API в окремий help-layer.

## 15. Вимоги до селекторів для турів

Для всіх елементів, що входять у tour, потрібно додати стабільні атрибути:

- `data-help-id`
- або `data-tour-id`

Не використовувати нестабільні CSS-класи або випадкові селектори на базі тексту, якщо цього можна уникнути.

Приклад:

```tsx
<button data-tour-id="financing-add-entry">Додати запис</button>
```

## 16. Контентні правила

Тексти мають бути:

- короткими;
- простими;
- предметними;
- без маркетингової "води".

Формула для summary:

`У цьому розділі ви ...`

Формула для first steps:

`Почніть з ...`

Формула для FAQ:

`Чим X відрізняється від Y?`

Максимальна довжина:

- `summary`: 160-220 символів
- `job-to-be-done`: до 100 символів
- `FAQ answer`: до 300 символів
- `tooltip/context help`: до 180 символів

## 17. Компоненти, які треба реалізувати

1. `HelpButton`
   Кнопка в header. Відкриває drawer для поточної сторінки.

2. `HelpDrawer`
   Права панель з route-specific контентом.

3. `PageIntroCard`
   Dismissible intro-картка на сторінці.

4. `ContextHelp`
   Універсальний tooltip/popover helper для складних полів.

5. `GuidedTour`
   Overlay walkthrough engine.

6. `usePageHelp(route)`
   Hook для отримання help-конфігу по route.

7. `help storage helpers`
   Читання/запис dismissed/completed state.

## 18. Поведінка MVP

1. Користувач заходить на `/admin-v2/financing`.
2. Якщо intro не dismiss:
   показати `PageIntroCard`.
3. У header завжди доступна кнопка `Help`.
4. Натискання `Help` відкриває drawer з описом саме `financing`.
5. Із drawer можна:
   - запустити тур;
   - переглянути FAQ;
   - перейти до related actions.
6. Якщо користувач закрив intro:
   воно більше не показується до зміни `version`.
7. Якщо користувач завершив тур:
   система пам'ятає completion-state.

## 19. Edge cases

1. Якщо route немає в registry:
   показати generic help:
   - назва сторінки;
   - базовий текст `Help for this page is coming soon`.
2. Якщо елемент туру не знайдено:
   крок скіпнути або показати fallback без падіння UI.
3. Якщо мобільний екран занадто вузький:
   tooltip/overlay має адаптуватись у bottom-sheet style.
4. Якщо `localStorage` недоступний:
   система повинна деградувати без крашу.

## 20. Аналітика

Якщо у проєкті є telemetry/event system, додати події:

1. `help_opened`
2. `help_intro_dismissed`
3. `help_tour_started`
4. `help_tour_completed`
5. `help_faq_opened`
6. `help_action_clicked`

Мінімальні payload:

- `route`
- `tourId`
- `role`
- `timestamp`

## 21. Доступність

Потрібно забезпечити:

- keyboard navigation;
- focus trap в drawer;
- `ESC close`;
- `aria-label` для help-trigger'ів;
- достатній контраст;
- не покладатись лише на hover.

## 22. Етапи реалізації

### Phase 1. Infrastructure

1. Створити типи help-system.
2. Створити `registry.ts`.
3. Реалізувати `HelpButton`.
4. Реалізувати `HelpDrawer`.
5. Інтегрувати в `admin-v2` header/layout.

### Phase 2. Page Intro

1. Реалізувати `PageIntroCard`.
2. Підключити до 3-4 ключових сторінок.
3. Додати `dismiss/version` storage.

### Phase 3. Guided Tours

1. Винести/адаптувати existing tutorial engine.
2. Додати stable selectors.
3. Реалізувати 3 перші тури:
   - `financing`
   - `projects`
   - `estimates`

### Phase 4. Context Help

1. Реалізувати `ContextHelp`.
2. Поставити на найскладніші поля в `financing` і `estimates`.

### Phase 5. Scale-out

1. Додати help-config для інших важливих сторінок.
2. Уніфікувати content-writing.
3. Підключити telemetry.

## 23. Acceptance Criteria

1. У `admin-v2` header є кнопка help.
2. Для route з registry відкривається route-specific help drawer.
3. На ключових сторінках показується intro-card з dismiss-state.
4. Тури запускаються з help drawer.
5. Тури не падають, якщо окремий selector відсутній.
6. Help state зберігається між сесіями.
7. На mobile help працює коректно.
8. На desktop help не перекриває критичні елементи неконтрольовано.
9. Додавання нового help-route не потребує копіювання великої логіки, лише новий config.
10. Existing AI panel continue working independently.

## 24. Мінімальний набір контенту для першої поставки

Підготувати контент мінімум для:

1. `Фінансування`
2. `Проєкти`
3. `Кошториси`

Для кожного:

- `summary`
- 3-5 `jobs-to-be-done`
- 3 `first steps`
- 3-5 `FAQ`
- 1-2 `guided tours`

## 25. Бажаний технічний результат

Після реалізації команда повинна отримати:

- централізовану help-архітектуру;
- легке масштабування на нові розділи;
- можливість писати help-контент як конфігурацію;
- єдину UX-модель пояснення складного продукту.

## 26. Що не входить у це ТЗ

Не входить у першу фазу:

- повноцінна база знань з markdown-сторінками;
- бекенд-редактор help-контенту;
- multi-language CMS для help;
- персоналізовані AI-generated onboarding flows;
- email onboarding.
