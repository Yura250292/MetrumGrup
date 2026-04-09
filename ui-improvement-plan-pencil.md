# План суттєвого покращення UI AI-генератора кошторисів через Pencil

## Мета

Оновити UI сторінки AI-генератора кошторисів так, щоб він виглядав значно дорожче, професійніше і сучасніше, але без зміни поточної логіки, API та сценаріїв роботи.

Ціль:

- зберегти всі функції;
- не чіпати backend flow;
- покращити композицію, ієрархію, ритм, подачу статусів і результуючий візуальний рівень;
- підготувати дизайн так, щоб його можна було відтворити через Pencil, а потім перенести в код.

---

## 1. Що зараз є в UI

На основі поточного коду сторінки `src/app/admin/estimates/ai-generate/page.tsx` UI складається з таких зон:

### Upload state

- hero з іконкою і заголовком;
- drag-and-drop зона;
- список файлів;
- wizard card;
- card з параметрами проекту;
- блок RAG;
- Prozorro-блок;
- велика primary CTA;
- card прогресу chunked generation.

### Result state

- хедер результату;
- verify card;
- scaling alert;
- debug card;
- список секцій у картках;
- таблиці позицій;
- модалки:
  - refine,
  - save,
  - supplement,
  - wizard,
  - pre-analysis.

### Додатково

- є окремі кольорові стани;
- є light/dark theme overrides у CSS;
- адмінка загалом використовує card-heavy підхід.

---

## 2. Головні проблеми поточного UI

### 2.1. UI виглядає як набір блоків, а не як цілісний продукт

Проблема:

- багато окремих `Card`;
- кожен блок живе своїм візуальним стилем;
- немає єдиної сильної композиційної системи.

Ефект:

- сторінка функціональна, але не має “дорогого” відчуття;
- виглядає як технічний кабінет, а не як преміальний AI-інструмент.

### 2.2. Надто проста одно-колоночна структура

Проблема:

- upload state майже повністю йде в одну вертикаль;
- великі текстові блоки йдуть один за одним;
- немає асиметрії, акцентних колонок, sticky summary, контекстної панелі.

Ефект:

- сторінка довга, плоска і монотонна;
- користувач швидко втрачає орієнтир.

### 2.3. Слабка візуальна ієрархія

Проблема:

- майже всі блоки однаково важливі;
- заголовки, підзаголовки, допоміжні пояснення не формують чіткого рівня пріоритету;
- CTA не має достатньої “сцени”.

Ефект:

- важко зчитати що головне саме зараз:
  - завантаження,
  - конфігурація,
  - вибір режиму,
  - контроль якості,
  - фінальний результат.

### 2.4. Перевантаження локальними кольоровими акцентами

Проблема:

- синій, фіолетовий, зелений, помаранчевий використовуються майже одночасно;
- gradient-стилі змішані без жорсткої системи;
- окремі модалки мають власну локальну атмосферу.

Ефект:

- сторінка строката;
- є відчуття UI-конструктора, а не продуманого продукту.

### 2.5. Wizard функціонально сильний, але візуально слабкий

Проблема:

- це велика модалка з простою формовою подачею;
- кроки виглядають як набір стандартних form controls;
- немає відчуття guided professional flow.

Ефект:

- найцінніша частина продукту не виглядає преміально;
- користувач не відчуває “розумності” системи.

### 2.6. Result state схожий на таблиці бухгалтерії, а не на smart AI estimate workspace

Проблема:

- багато таблиць;
- секції подані утилітарно;
- слабко оформлено:
  - джерела цін,
  - confidence,
  - рекомендації,
  - проблемні місця.

Ефект:

- після генерації сторінка не виглядає як “аналітичний cockpit”;
- не вистачає відчуття глибини, контролю і trust layer.

### 2.7. Модалки дублюють один і той самий підхід

Проблема:

- refine/save/supplement/pre-analysis/wizard всі подані як схожі затемнені попапи з card-коробкою;
- немає модального hierarchy system;
- нема поділу на:
  - lightweight dialog,
  - side panel,
  - immersive full-screen flow.

Ефект:

- все виглядає однаково;
- продукт не використовує сильні UX-патерни для складних сценаріїв.

---

## 3. Що треба отримати після редизайну

Новий UI має відчуватись як:

- premium admin AI tool;
- design-forward construction intelligence console;
- не “простий CRM”, а спеціалізований професійний інструмент.

Тональність:

- спокійна;
- точна;
- професійна;
- технологічна;
- впевнена;
- без візуального шуму.

---

## 4. Принципи нового UI

### 4.1. Одна сильна візуальна система

Треба перейти від “багато карток” до:

- чіткої page shell;
- сильного hero;
- однорідної системи surface layers;
- структурованої grid-композиції.

### 4.2. Два режими сторінки

Сторінку треба мислити як 2 окремі сцени:

1. `Setup / Input Workspace`
2. `Estimate Review Workspace`

Вони мають бути схожими по стилю, але не однаковими по композиції.

### 4.3. Менше випадкових акцентів, більше системи

Кольори:

- 1 primary brand accent;
- 1 secondary support accent;
- 1 success;
- 1 warning;
- 1 danger.

Не змішувати 4-5 активних градієнтів на одному екрані.

### 4.4. Більше “editor/workspace” логіки

Особливо в result state треба відчути:

- робочу поверхню;
- секції як керовані блоки;
- sticky contextual summary;
- бокову аналітичну панель;
- зону AI trust indicators.

### 4.5. Модалки треба диференціювати

- Wizard: full-screen modal / immersive sheet
- Refine: focused side panel
- Save: compact dialog
- Supplement: larger utility panel
- Pre-analysis: report viewer

---

## 5. Рекомендований новий візуальний напрямок

### Напрямок

`Architectural Intelligence Workspace`

Образ:

- світлі “paper-like” поверхні;
- глибокий нейтральний фон;
- тонкі технічні лінії;
- професійні таблиці;
- статуси як інструмент аналітики, а не як випадкові кольорові бейджі;
- відчуття будівельної точності + AI sophistication.

### Візуальні асоціації

- premium B2B SaaS;
- architectural review software;
- modern tender intelligence dashboard;
- productized professional AI system.

### Що уникати

- занадто “consumer startup” стиль;
- надлишок glow, purple gradients, neumorphism;
- банальні “AI magic” патерни;
- перенасичення іконками та кольорами.

---

## 6. Концепція композиції сторінки

## 6.1. Setup / Input Workspace

Замість однієї вузької колонки зробити 2-колоночну композицію:

### Ліва головна колонка

- hero;
- upload dropzone;
- file intelligence preview;
- project info;
- Prozorro / RAG / notes.

### Права sticky колонка

- project status summary;
- wizard completion status;
- selected files stats;
- selected project / RAG status;
- quick checklist;
- main CTA;
- processing hints.

Ефект:

- сторінка виглядатиме більш доросло;
- CTA матиме власний простір;
- користувач бачитиме стан готовності до генерації.

## 6.2. Result / Review Workspace

Замість просто списку секцій зробити 3-рівневу структуру:

### Верхній header

- title;
- total estimate;
- primary actions;
- generation metadata.

### Центральна робоча зона

- секції кошторису;
- табличний редактор;
- інлайн confidence/source;
- better collapse behavior.

### Права sticky insights panel

- total summary;
- verification score;
- warnings;
- scaling info;
- low-confidence items count;
- export/save actions.

Ефект:

- фінальний екран буде схожий на professional estimate workstation.

---

## 7. Конкретні покращення по блоках

## 7.1. Hero section

### Зараз

- маленький header з іконкою;
- візуально занадто скромний для головного AI-інструмента.

### Треба

- ширший hero block;
- title + concise subheadline;
- 3-4 trust metrics у ряд;
- background atmosphere;
- акуратний technical pattern / gradient field.

### Вміст

- назва інструмента;
- підпис що саме він робить;
- badges:
  - AI + RAG
  - Prozorro
  - Engineering Review
- secondary metadata:
  - supported file types,
  - typical estimate depth,
  - time-to-generate.

## 7.2. Upload zone

### Зараз

- типова dashed dropzone;
- виглядає базово.

### Треба

- зробити dropzone “центральною сценою”;
- сильніший контейнер;
- preview tiles файлів;
- file status indicators;
- clearer empty state / hover state / loaded state.

### Поліпшення

- icon area більша;
- microcopy коротша і чіткіша;
- групувати файли по типах;
- показувати:
  - count,
  - total size,
  - readiness.

## 7.3. Wizard card

### Зараз

- просто ще одна card.

### Треба

- зробити це окремим premium block;
- показати його як “guided intelligence mode”.

### Поліпшення

- ліворуч короткий value pitch;
- праворуч completion meter;
- список що дає wizard:
  - точніші обсяги,
  - більше позицій,
  - краща ціна;
- CTA сильніший;
- completed state візуально відрізняється.

## 7.4. Project parameters block

### Проблема

- textarea дуже утилітарна;
- блок виглядає як базова форма.

### Треба

- розділити на підблоки:
  - area,
  - project notes,
  - known constraints;
- додати smarter field framing;
- зробити textarea більш “editor-like”.

### Поліпшення

- підказки справа або зверху;
- token-like chips для відомих фактів;
- helper state;
- character counter менш грубий.

## 7.5. RAG / Prozorro блоки

### Зараз

- функціонально корисні;
- але візуально виглядають як окремі випадкові карточки.

### Треба

- інтегрувати їх у “Data Sources” section;
- оформити як контрольований stack:
  - Internal inputs,
  - Project memory (RAG),
  - Market context (Prozorro).

### Поліпшення

- icon + title + status pill;
- expandable advanced settings;
- concise copy;
- unified style.

## 7.6. Generate CTA area

### Зараз

- велика кнопка, але навколо неї мало “ваги”.

### Треба

- CTA block як sticky decision area;
- readiness checklist;
- expectation panel:
  - estimated time,
  - mode,
  - number of agents,
  - selected sources.

### Поліпшення

- primary button;
- secondary “preview setup” / “validate inputs” action;
- readiness signal:
  - ready,
  - missing files,
  - wizard optional,
  - project not selected.

## 7.7. Generation progress

### Зараз

- функціонально є;
- подача ще технічна.

### Треба

- timeline-like progress block;
- current stage emphasis;
- completed stage cards;
- more premium sense of progression.

### Поліпшення

- multi-step rail;
- stage numbers;
- richer section completion chips;
- live estimate metadata.

## 7.8. Result header

### Зараз

- класичний admin header.

### Треба

- результат має починатися з сильного overview strip:
  - total amount,
  - sections,
  - items,
  - verification,
  - confidence profile.

### Поліпшення

- велике total figure;
- compact KPI row;
- actions винести праворуч в grouped toolbar.

## 7.9. VerificationResults

### Зараз

- хороша функціональна картка;
- але можна зробити більш вишукано.

### Треба

- score area;
- issues grouped by severity;
- visual severity system;
- cleaner recommendation formatting.

### Поліпшення

- score dial / meter;
- tabs:
  - summary,
  - issues,
  - improvements;
- colored left border замість локального шуму.

## 7.10. Section cards and estimate table

### Зараз

- таблиці коректні, але дуже утилітарні;
- мало візуальної структури між секціями.

### Треба

- section shell сильніший;
- header секції більш “architected”;
- stats в header;
- cleaner table rhythm.

### Поліпшення

- section icon / category chip;
- items count;
- subtotal;
- stronger collapse affordance;
- zebra/hover discipline;
- sticky table header у великих секціях;
- source/confidence row як secondary metadata.

## 7.11. Total card

### Зараз

- окремий темний блок;
- виглядає відривчасто від решти layout.

### Треба

- інтегрувати у right insights panel;
- тримати total завжди видимим.

### Поліпшення

- subtotal / labor / overhead / final total;
- export buttons;
- save state;
- verification summary.

## 7.12. Modals

### Треба розвести за типами

#### Wizard

- full-screen centered workspace;
- left progress rail;
- central step content;
- right contextual help.

#### Pre-analysis

- report viewer layout;
- summary on top;
- structured document findings below;
- better readability.

#### Refine

- side panel справа;
- current estimate context;
- model selection;
- prompt editor;
- suggestion chips.

#### Save

- компактний dialog;
- project picker;
- concise summary.

#### Supplement

- utility side panel або medium modal;
- upload list;
- progress area;
- expected outcome summary.

---

## 8. Новий дизайн-сет компонентів для Pencil

Перед редизайном потрібно намалювати окремий mini design system для цієї сторінки.

## Компоненти

- `PageHero`
- `MetricPill`
- `SourceStatusCard`
- `UploadDropzone`
- `FileTile`
- `WizardPromoCard`
- `SetupSidebarCard`
- `PrimaryCTAStack`
- `TimelineProgressCard`
- `ResultHeader`
- `SummarySidebar`
- `EstimateSectionCard`
- `EstimateDataTable`
- `ConfidenceBadge`
- `SourceBadge`
- `VerificationPanel`
- `InsightCard`
- `ModalShell`
- `SidePanelShell`

## Стани компонентів

Для кожного зробити:

- default
- hover
- active
- success
- warning
- disabled

---

## 9. Рекомендований visual system

## Typography

Використати більш виразну, але професійну ієрархію:

- Display: для total / hero
- Heading: для секцій
- Body: для контенту
- Label: для полів
- Mono / tabular: для сум і технічних значень

В Pencil варто відразу задати:

- `Display L`
- `Display M`
- `Heading L`
- `Heading M`
- `Body M`
- `Body S`
- `Label S`
- `Mono S`

## Spacing

Визначити scale:

- 4
- 8
- 12
- 16
- 24
- 32
- 40
- 56

## Radius

- 12 для inputs
- 16 для cards
- 20 для hero / large containers

## Shadows

Тільки 3 рівні:

- surface 1
- surface 2
- modal

## Colors

Потрібен набір:

- background
- panel
- panel-elevated
- border-soft
- border-strong
- text-primary
- text-secondary
- text-muted
- accent-primary
- accent-secondary
- success
- warning
- danger

---

## 10. План роботи саме через Pencil

Нижче workflow, який зручно реалізувати в Pencil без зміни логіки продукту.

## Етап A. Підготовка canvas

Створити у `.pen` файлі 5 top-level frames:

1. `AI Estimate - Design System`
2. `AI Estimate - Setup Desktop`
3. `AI Estimate - Setup Mobile`
4. `AI Estimate - Result Desktop`
5. `AI Estimate - Result Mobile`

Додатково:

6. `AI Estimate - Wizard`
7. `AI Estimate - Pre-analysis`
8. `AI Estimate - Refine Panel`
9. `AI Estimate - Save Dialog`
10. `AI Estimate - Supplement Dialog`

## Етап B. Спочатку відмалювати design system

У `AI Estimate - Design System` створити:

- colors
- typography
- spacing tokens
- card variants
- button variants
- input variants
- badges
- table styles
- modal shells

Не починати зі screen composition до того, як не зібраний цей frame.

## Етап C. Потім зібрати desktop setup state

Порядок:

1. page shell
2. hero
3. two-column layout
4. upload block
5. wizard block
6. configuration blocks
7. right sticky summary
8. CTA area

## Етап D. Потім result state

Порядок:

1. result header
2. right summary sidebar
3. verification panel
4. section cards
5. table styling
6. empty / expanded / editing row states

## Етап E. Потім modal family

Окремо:

- full-screen wizard
- report modal
- refine side panel
- compact save dialog
- supplement utility panel

## Етап F. Потім mobile adaptation

На mobile не просто стискати desktop, а перебудувати:

- hero компактніший;
- sticky bottom CTA;
- акордеонна подача блоків;
- секції вертикалізувати;
- summary в bottom sheet патерні.

---

## 11. Що саме малювати в Pencil по кроках

## Крок 1. Design direction board

У першому frame зафіксувати:

- 3 mood tiles;
- 1 color direction;
- 1 typography direction;
- 1 sample layout skeleton.

## Крок 2. Layout skeletons

Для кожного ключового екрана спершу відмалювати low-fidelity wireframe:

- без деталей;
- лише блоки;
- лише композиція і hierarchy.

## Крок 3. High-fidelity surfaces

Після затвердження skeleton:

- додати colors;
- radius;
- shadows;
- table style;
- badges;
- hover intentions.

## Крок 4. States

Для кожного ключового сценарію зробити окремі варіанти:

### Setup

- empty
- files added
- ready to generate
- generating

### Result

- successful result
- with verification warnings
- with low-confidence items
- editing item

### Modal family

- wizard progress
- refine open
- supplement in progress

## Крок 5. Developer handoff layer

Додати в Pencil окремо:

- annotations;
- spacing notes;
- sticky behavior notes;
- responsive behavior notes.

---

## 12. Рекомендований обсяг першої дизайн-ітерації

Щоб не роздути задачу, перший цикл через Pencil має покрити:

1. Setup Desktop
2. Result Desktop
3. Wizard Fullscreen
4. Refine Side Panel
5. Mobile compressed version для setup/result

Не потрібно спочатку малювати кожен дрібний стан.

---

## 13. Пріоритети UI-покращення

## Пріоритет A

- page composition
- setup sidebar
- result sidebar
- wizard redesign
- table redesign

## Пріоритет B

- verification panel redesign
- progress timeline
- modal system
- data source blocks

## Пріоритет C

- micro-interaction hints
- hover states
- richer empty states
- polished mobile patterns

---

## 14. Конкретний backlog для UI редизайну

- [ ] Побудувати mini design system в Pencil
- [ ] Визначити 1 візуальний напрямок без строкатості
- [ ] Перебудувати setup screen у 2-колоночний workspace
- [ ] Перебудувати result screen у review workspace з правою sticky sidebar
- [ ] Перемалювати upload zone
- [ ] Перемалювати wizard promo block
- [ ] Перемалювати RAG / Prozorro / notes як єдину data source групу
- [ ] Перемалювати CTA section
- [ ] Перемалювати generation progress як timeline
- [ ] Перемалювати verification panel
- [ ] Перемалювати section cards
- [ ] Перемалювати таблицю позицій
- [ ] Зробити modal hierarchy
- [ ] Зробити mobile adaptation
- [ ] Додати handoff notes для frontend

---

## 15. Що не змінювати

Під час UI редизайну через Pencil не змінювати логіку:

- wizard steps;
- API маршрути;
- generate / refine / supplement flow;
- verify flow;
- Prozorro / RAG logic;
- структуру даних estimate.

UI redesign має бути presentation-only.

---

## 16. Очікуваний результат

Після реалізації цього плану сторінка має:

- виглядати як сильний premium B2B AI продукт;
- краще продавати цінність AI-генератора;
- бути простішою для сканування;
- виглядати дорожче і сучасніше;
- мати сильнішу ієрархію;
- краще підтримувати складні сценарії без візуального хаосу.

---

## 17. Рекомендований наступний крок

Практично найкращий старт через Pencil:

1. створити `Design System` frame;
2. відмалювати `Setup Desktop` wireframe;
3. відмалювати `Result Desktop` wireframe;
4. затвердити композицію;
5. тільки після цього переходити до high-fidelity.

Якщо почати одразу з деталей, є ризик знову отримати просто “гарніші карточки”, а не реально кращий продукт.

