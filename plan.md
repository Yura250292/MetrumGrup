# План покращення AI-генератора кошторисів

## Мета

Підвищити точність, відтворюваність і контрольованість генератора AI-кошторисів так, щоб:

- кількості рахувались на основі структурованих параметрів, а не лише з текстових здогадок моделі;
- ціни спирались на перевірені джерела з пріоритетами;
- labor/material breakdown не втрачався при збереженні;
- валідація реально ловила помилки, а не створювала хибне відчуття перевірки;
- refine/update сценарії працювали як дельта до існуючого кошторису, а не як майже нова генерація.

## Поточні проблеми

### 1. LLM робить занадто багато

Зараз модель:

- аналізує документи;
- придумує склад робіт;
- оцінює кількості;
- оцінює ціни;
- рахує totals.

Це дає нестабільні результати навіть на однаковому вході.

### 2. Пошук цін не є реальним прайсингом

У `src/lib/price-search.ts` ціни фактично знову генеруються Gemini-промптом, а не беруться з реального пошуку, API чи контрольованої БД.

### 3. Втрачається структура трудовитрат

У схемі є:

- `EstimateItem.laborRate`
- `EstimateItem.laborHours`

Але при збереженні з AI-генерації пишеться:

- `laborRate: 0`
- `laborHours: 0`
- сума лише в `amount`

Через це:

- неможливо коректно аналізувати роботу;
- UI показує порожню колонку роботи;
- refine/save спотворює економіку позицій.

### 4. Валідація частково дивиться не на ті поля

У `src/lib/estimate-validation.ts` більшість правил використовує `item.name`, а реальні об’єкти мають `item.description`.

Наслідки:

- частина перевірок фактично не працює;
- дублікати, forbidden items, mismatch із wizard можуть не ловитись;
- quality gate ненадійний.

### 5. Refine працює як майже нова генерація

У `/api/admin/estimates/[id]/refine` формується дуже збіднений `wizardData`, після чого викликається multi-agent генерація майже з нуля.

Наслідки:

- drift між старим і новим кошторисом;
- випадкові зміни в не пов’язаних секціях;
- слабка пояснюваність змін.

### 6. Немає еталонного benchmark-набору

У проєкті є реальні PDF/XLSX приклади, але вони не використовуються як вимірюваний набір для оцінки якості генератора.

## Цільова архітектура

Побудувати генератор у 5 шарах:

1. `Document Understanding`
2. `Structured Project Facts`
3. `Deterministic Quantity Engine`
4. `Price Engine`
5. `Validation + Diff + Review`

### 1. Document Understanding

Завдання:

- витягнути структуровані факти з планів, специфікацій, фото, геології;
- не рахувати тут кошторис;
- не просити модель одразу будувати фінальний estimate JSON.

Вихід:

- `ProjectFacts`
- `DetectedConstraints`
- `DetectedRisks`
- `SourceConfidence`

### 2. Structured Project Facts

Створити єдиний нормалізований об’єкт, наприклад:

```ts
type ProjectFacts = {
  objectType: "house" | "apartment" | "commercial" | "other";
  area: number;
  floors?: number;
  rooms?: Array<{ name: string; area?: number; type?: string }>;
  walls?: {
    material?: string;
    thicknessMm?: number;
    estimatedWallAreaM2?: number;
  };
  electrical?: {
    outlets?: number;
    switches?: number;
    lightPoints?: number;
    panelCount?: number;
    cableRoutesM?: number;
  };
  plumbing?: {
    toilets?: number;
    sinks?: number;
    showers?: number;
    bathtubs?: number;
    kitchenSinks?: number;
    waterPoints?: number;
    sewerPoints?: number;
  };
  heating?: {
    radiators?: number;
    underfloorAreaM2?: number;
  };
  geology?: {
    groundwaterLevelM?: number;
    soilType?: string;
    recommendedFoundation?: string;
  };
};
```

Цей об’єкт має збиратися з:

- wizard;
- RAG extracted data;
- parsed specifications;
- photo/geology parsers.

Пріоритет джерел:

1. user wizard
2. explicit specification values
3. parsed drawing values
4. inferred defaults

## Детальний план робіт

## Етап 1. Швидкі критичні виправлення

Тривалість: 1-2 дні

### 1.1. Полагодити валідацію полів `name` vs `description`

Файли:

- `src/lib/estimate-validation.ts`

Що зробити:

- замінити всі звернення до `item.name` на `item.description`;
- додати helper:

```ts
const itemLabel = item.description || item.name || "Невідома позиція";
```

- оновити правила:
  - price validation
  - quantity validation
  - duplicate detection
  - forbidden items
  - wizard compliance
  - calculation errors

Очікуваний результат:

- валідація почне реально працювати на фактичній структурі даних.

### 1.2. Не втрачати labor breakdown при записі кошторису

Файли:

- `src/app/api/admin/estimates/generate-chunked/route.ts`
- `src/app/api/admin/estimates/[id]/refine/route.ts`
- `src/app/admin/estimates/ai-generate/page.tsx`

Що зробити:

- тимчасово додати окреме поле збереження `laborCost` у pipeline перетворення;
- якщо схема БД не розширюється одразу, то хоча б консистентно перетворювати:
  - `laborRate`
  - `laborHours`
  - `amount`

Мінімально допустимий варіант:

- `laborHours = 1`
- `laborRate = laborCost`

Кращий варіант:

- додати в БД окреме поле `laborCostTotal`.

Очікуваний результат:

- UI не показує пусту роботу;
- totals узгоджені з деталізацією.

### 1.3. Прибрати евристику `laborCost / 200`

Файл:

- `src/app/admin/estimates/ai-generate/page.tsx`

Що зробити:

- не вигадувати години з фіксованої ставки;
- передавати трудову вартість як окреме значення або через серверний трансформер;
- перенести мапінг AI-format -> DB-format на backend.

### 1.4. Додати hard-check на обов’язкові поля позиції

Файли:

- `src/lib/agents/base-agent.ts`
- `src/lib/agents/master-estimate-agent.ts`

Що зробити:

- reject позиції без:
  - `description`
  - `quantity > 0`
  - `unit`
  - `unitPrice >= 0`
  - `totalCost`

- якщо `totalCost` не збігається з формулою, виправляти серверно перед збереженням.

## Етап 2. Нормалізувати дані проекту

Тривалість: 2-4 дні

### 2.1. Ввести єдиний `ProjectFacts`

Нові файли:

- `src/lib/project-facts.ts`
- `src/lib/project-facts-builder.ts`

Інтеграція:

- `src/lib/agents/pre-analysis-agent.ts`
- `src/lib/rag/vectorizer.ts`
- `src/app/api/admin/estimates/generate-chunked/route.ts`

Що зробити:

- зібрати всі сигнали в єдину структуру;
- розмітити кожне поле джерелом:
  - `wizard`
  - `spec`
  - `drawing`
  - `rag`
  - `inferred`

Приклад:

```ts
type SourcedValue<T> = {
  value: T;
  source: "wizard" | "spec" | "drawing" | "rag" | "inferred";
  confidence: number;
};
```

Очікуваний результат:

- генератор працює не від сирого тексту, а від нормалізованих параметрів.

### 2.2. Визначити конфлікти джерел

Що зробити:

- якщо у wizard 120 м², а з плану 138 м²:
  - не мовчати;
  - логувати conflict;
  - показувати warning;
  - обирати джерело за пріоритетом.

### 2.3. Винести обчислення derived values

Що зробити:

- на сервері порахувати:
  - estimated wall area
  - ceiling area
  - floor area by room
  - base cable route length
  - plumbing route estimates
  - openings estimates if explicit counts absent

## Етап 3. Побудувати deterministic quantity engine

Тривалість: 4-7 днів

### 3.1. Створити engine нормованих quantity rules

Нові файли:

- `src/lib/quantity-engine/index.ts`
- `src/lib/quantity-engine/rules/electrical.ts`
- `src/lib/quantity-engine/rules/plumbing.ts`
- `src/lib/quantity-engine/rules/finishing.ts`
- `src/lib/quantity-engine/rules/foundation.ts`
- `src/lib/quantity-engine/rules/walls.ts`

Принцип:

- модель не вигадує quantity;
- модель лише пропонує список потрібних позицій;
- кількість рахує код за правилами.

Приклади правил:

- штукатурка стін = `wallArea * 1.05`
- шпаклівка = `wallArea * 1.03`
- грунтовка = `wallArea * coverageFactor`
- кабель для розеток = `outlets * avgCableLengthPerOutlet`
- підрозетники = `outlets + switches`
- плитковий клей = `tileArea * consumptionKgPerM2`
- затирка = `tileArea * groutFactor`

### 3.2. Розділити item type

Кожна позиція має належати одному типу:

- `material`
- `labor`
- `equipment`
- `composite`

Для точності краще перейти на `material + labor` окремими рядками замість змішаних позицій.

### 3.3. Ввести коефіцієнти запасу

У quantity engine формалізувати:

- waste factor
- cutting factor
- transport loss
- slope complexity
- groundwater impact

Приклади:

- плитка: `+7%`
- ламінат: `+10%`
- арматура: `+12-15%`
- бетон: `+3-5%`

### 3.4. Додати regional and object modifiers

Параметри:

- тип об’єкта;
- нове будівництво чи реконструкція;
- комерція чи житло;
- складність вузлів;
- преміум/стандарт.

## Етап 4. Побудувати справжній price engine

Тривалість: 4-6 днів

### 4.1. Ввести єдиний сервіс ціноутворення

Нові файли:

- `src/lib/price-engine/index.ts`
- `src/lib/price-engine/types.ts`
- `src/lib/price-engine/providers/material-catalog.ts`
- `src/lib/price-engine/providers/prozorro.ts`
- `src/lib/price-engine/providers/web-scrape.ts`
- `src/lib/price-engine/providers/fallback-llm.ts`

Порядок джерел:

1. internal verified catalog
2. Prozorro parsed references
3. supplier/store sources
4. LLM fallback with low confidence

### 4.2. Розширити internal catalog

Поточні:

- `src/lib/materials-database.ts`
- `src/lib/work-items-database.ts`

Що зробити:

- перейти від “демо-бази” до production-каталогу;
- додати:
  - canonical item ID
  - aliases
  - category
  - unit
  - region
  - min/max/median
  - effective date
  - VAT flag
  - brand alternatives

### 4.3. Прибрати ілюзію “google search”

Файл:

- `src/lib/price-search.ts`

Що зробити:

- або реально підключити зовнішнє джерело;
- або чесно перейменувати модуль у `llm-price-estimate.ts`;
- confidence не можна ставити високим лише тому, що модель так сказала.

### 4.4. Нормалізувати Prozorro matching

Що зробити:

- мапити item descriptions на canonical SKU/work keys;
- порівнювати не тільки по тексту, а й по:
  - unit
  - category
  - project type
  - date age
  - region

### 4.5. Врахувати інфляцію і дату джерела

Для кожної ціни зберігати:

- `sourceDate`
- `adjustedDate`
- `inflationFactor`
- `region`

## Етап 5. Перебудувати генерацію секцій

Тривалість: 3-5 днів

### 5.1. Змінити роль LLM

Замість:

- “згенеруй повний item list з quantity, price, total”

має бути:

- “визнач потрібні work packages / material groups / missing risks”

Приклад виходу моделі:

```json
{
  "section": "Електрика",
  "requiredWorkPackages": [
    "main_panel",
    "socket_lines",
    "lighting_lines",
    "switches",
    "grounding",
    "low_current"
  ],
  "specialConstraints": [
    "wet_zone_protection",
    "commercial_load"
  ],
  "confidence": 0.82
}
```

А потім сервер:

- мапить package -> canonical estimate items;
- рахує quantity;
- підтягує price;
- рахує totals.

### 5.2. Зменшити свободу model output

Для master mode:

- перейти на строго типізовані схеми;
- додати post-processing sanitizer;
- будь-які невідомі поля чи units відкидати.

### 5.3. Перетворити секції на шаблони

Створити конфіг секцій:

- required items
- optional items
- trigger conditions
- quantity formulas
- pricing strategy

Наприклад:

- `electrical.section.ts`
- `plumbing.section.ts`
- `finishing.section.ts`

## Етап 6. Переробити refine/update flow

Тривалість: 3-4 дні

### 6.1. Refine має бути delta-based

Замість повної регенерації:

- визначити impacted sections;
- перерахувати лише їх;
- зібрати diff;
- показати old vs new.

### 6.2. Зберігати версії з причинами змін

Для кожного refine:

- `changeReason`
- `changedSections`
- `changedItems`
- `oldValue`
- `newValue`
- `sourceDocument`

### 6.3. Додати explainability

Для кожної зміненої позиції:

- чому змінилась;
- яке джерело вплинуло;
- чи змінився quantity, price або тільки source.

## Етап 7. Посилити валідацію

Тривалість: 3-5 днів

### 7.1. Rule-based validators

Нові файли:

- `src/lib/validators/structural-validator.ts`
- `src/lib/validators/quantity-validator.ts`
- `src/lib/validators/price-validator.ts`
- `src/lib/validators/completeness-validator.ts`
- `src/lib/validators/wizard-consistency-validator.ts`

### 7.2. Приклади правил

- якщо є `tileArea > 0`, мають бути:
  - плитка
  - клей
  - затирка
  - робота по укладанню

- якщо є `outlets > 0`, мають бути:
  - кабель
  - підрозетники
  - автомати або групи
  - монтаж

- якщо `groundwaterLevel < threshold`, мають бути:
  - гідроізоляція
  - дренаж

- якщо `demolitionRequired = false`, жодних demolition items.

### 7.3. Summary reconciliation

Сервер повинен примусово перераховувати:

- `materialsCost`
- `laborCost`
- `overheadCost`
- `totalBeforeDiscount`
- `sectionTotal`
- `grandTotal`

LLM не повинна бути джерелом істини для сум.

## Етап 8. Покращити UI для контролю якості

Тривалість: 2-4 дні

### 8.1. Показувати confidence і source на позиції

На UI кожна позиція має мати:

- source badge
- confidence badge
- last updated date

### 8.2. Показувати verification status чесно

Окремо:

- verified items
- estimated items
- low-confidence items
- unresolved conflicts

### 8.3. Додати “review queue”

Окремий блок:

- які позиції потребують перевірки інженером;
- які ціни без надійного джерела;
- які кількості конфліктують з wizard/documents.

## Етап 9. Тести і benchmark

Тривалість: 3-6 днів

### 9.1. Створити benchmark dataset

Використати наявні реальні файли з workspace як тестові кейси:

- вхідні документи;
- еталонний кошторис;
- допустимий діапазон похибки.

### 9.2. Метрики якості

Міряти:

- `absolute total error %`
- `section error %`
- `item count completeness`
- `source coverage %`
- `low confidence share %`
- `validation issues count`

### 9.3. Regression tests

Потрібні:

- unit tests для quantity formulas;
- integration tests для generation pipeline;
- snapshot tests для normalized `ProjectFacts`;
- tests для refine diff.

## Етап 10. Дані і міграції

Тривалість: 2-3 дні

### 10.1. Розширити модель БД

Рекомендовані поля для `EstimateItem`:

- `itemType`
- `sourceType`
- `sourceRef`
- `sourceDate`
- `confidence`
- `laborCostTotal`
- `materialCostTotal`
- `quantityFormula`
- `quantityInputs`
- `canonicalItemKey`

### 10.2. Міграція старих кошторисів

Для старих estimate items:

- не намагатися “вигадати” labor breakdown;
- помітити як legacy;
- обчислити derived fields лише там, де можливо.

## Пріоритети впровадження

### Пріоритет A. Робити першими

1. Полагодити `item.name` -> `item.description`
2. Прибрати втрату labor breakdown
3. Перераховувати totals тільки на сервері
4. Прибрати евристику `laborCost / 200`
5. Додати rule-based validation для ключових секцій

### Пріоритет B. Найбільший приріст точності

1. `ProjectFacts`
2. deterministic quantity engine
3. price engine with source priority
4. delta refine

### Пріоритет C. Посилення продукту

1. confidence UI
2. benchmark suite
3. explainability / diffs / review queue

## Рекомендований порядок реалізації

### Фаза 1

- fix validation
- fix persistence
- fix totals
- fix save/refine mapping

### Фаза 2

- build `ProjectFacts`
- build quantity engine for 3 секції:
  - electrical
  - plumbing
  - finishing

### Фаза 3

- build price engine
- connect Prozorro and catalog priority
- mark low-confidence items

### Фаза 4

- delta refine
- benchmark dataset
- release quality dashboard

## Конкретний технічний backlog

### Backend

- [ ] Виправити `estimate-validation.ts` на `description`
- [ ] Додати server-side estimate normalizer
- [ ] Додати server-side totals recalculator
- [ ] Додати `ProjectFacts` builder
- [ ] Додати quantity engine
- [ ] Додати unified price engine
- [ ] Додати source/confidence persistence
- [ ] Переробити refine на diff-based flow

### Database

- [ ] Спроєктувати нові поля `EstimateItem`
- [ ] Додати міграцію
- [ ] Додати прапорець legacy data

### Frontend

- [ ] Показувати labor correctly
- [ ] Показувати source/confidence
- [ ] Показувати warnings by section
- [ ] Додати review queue
- [ ] Додати diff view для refine

### QA

- [ ] Зібрати benchmark cases
- [ ] Написати integration tests
- [ ] Додати regression suite
- [ ] Виміряти baseline accuracy до змін
- [ ] Виміряти accuracy після кожної фази

## Критерії успіху

Після впровадження:

- total error на benchmark-кейсах зменшується мінімум удвічі;
- частка low-confidence items падає;
- refine змінює лише релевантні секції;
- labor/material/overhead узгоджені між UI, БД і експортом;
- валідація ловить реальні помилки до збереження.

## Перший практичний спринт

Якщо запускати вже зараз, рекомендований перший спринт:

1. Виправити `description` у валідації
2. Прибрати втрату labor даних у `generate-chunked` і `[id]/refine`
3. Перенести перерахунок totals на сервер
4. Додати `normalized estimate sanitizer`
5. Додати benchmark на 2-3 реальних проектах

Це дасть найшвидший приріст точності без повної перебудови архітектури.
