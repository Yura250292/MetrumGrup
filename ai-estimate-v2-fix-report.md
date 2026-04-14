# AI Estimate V2 Fix Report

## Контекст

Під час тестування нового UI `AI кошторис V2` генерація повертала нульовий кошторис, а в браузерних логах було видно:

- успішне завантаження 20/20 файлів у R2;
- помилку `500` на запиті `verify`;
- симптом "помилка оздоблення";
- відображення нульового результату в UI.

---

## Що було досліджено

Було перевірено:

- V2 frontend controller;
- chunked generation flow;
- route `/api/admin/estimates/verify`;
- `MasterEstimateAgent`;
- normalizer AI item-ів;
- логіка передачі `wizardData` з V2 у backend.

Ключові файли:

- [src/app/ai-estimate-v2/_lib/use-controller.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/ai-estimate-v2/_lib/use-controller.ts)
- [src/app/api/admin/estimates/verify/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/verify/route.ts)
- [src/lib/agents/master-estimate-agent.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/agents/master-estimate-agent.ts)
- [src/lib/estimates/ai-item-normalizer.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/estimates/ai-item-normalizer.ts)

---

## Що було знайдено

### 1. V2 не гарантував передачу площі в реальний generation payload

У V2 поле площі жило окремо як `area`, але backend генерації читає площу з:

- `wizardData.totalArea`
- `wizardData.area`

Через це був ризик, що користувач вводить площу в UI, але backend не отримує її в структурі `wizardData`, яка реально використовується генератором.

### 2. AI-числа могли перетворюватися в `0`

І в `MasterEstimateAgent`, і в `ai-item-normalizer` значення парсились через голий `Number(...)`.

Це ламалося на відповідях AI у форматах:

- `12,5`
- `1 250,00`
- `450 грн`

У такому випадку:

- `quantity` міг стати `0`
- `unitPrice` міг стати `0`
- `laborCost` міг стати `0`
- section totals і summary могли впасти в нуль

Це дуже правдоподібна причина нульового кошторису.

### 3. `verify` route міг валитися з `500`

Route `/api/admin/estimates/verify` був жорстким:

- якщо не вдавалося прочитати інструкцію;
- якщо падала OpenAI верифікація;
- якщо був будь-який runtime збій,

він повертав `500`.

Для V2 це був шумний secondary-failure: сам кошторис міг бути згенерований, але UI бачив server error на verify.

### 4. V2 неправильно інтерпретував формат відповіді verify API

Route повертав об’єкт формату:

```json
{
  "verification": { ... }
}
```

А V2 читав результат так, ніби `overallScore`, `issues` і `summary` лежать на корені.

Через це навіть успішна верифікація могла не відобразитися правильно.

### 5. V2 міг мовчки показати порожній результат

Якщо фінальний estimate приходив без валідних секцій/items, UI міг перейти в state з порожнім кошторисом замість того, щоб поставити явну помилку користувачу.

---

## Що було виправлено

## 1. Площа тепер форсується в payload генерації

У V2 controller перед генерацією тепер формується `resolvedArea`, який підставляється в:

- `wizardData.totalArea`
- `wizardData.area`

Файл:

- [src/app/ai-estimate-v2/_lib/use-controller.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/ai-estimate-v2/_lib/use-controller.ts)

Ефект:

- backend завжди отримує площу в тій структурі, яку реально використовує.

## 2. Додано безпечний парсинг AI-чисел

Було додано підтримку чисел у форматах:

- `12,5`
- `1 250,00`
- `450 грн`
- `1250`

Файли:

- [src/lib/estimates/ai-item-normalizer.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/estimates/ai-item-normalizer.ts)
- [src/lib/agents/master-estimate-agent.ts](/Users/admin/Igor-Shiba/metrum-group/src/lib/agents/master-estimate-agent.ts)

Ефект:

- quantity/unitPrice/laborCost більше не повинні валитися в нуль через локалізований формат чисел від AI.

## 3. Верифікація стала неблокуючою

Route `/verify` тепер:

- не падає з `500` як фатальна UI-помилка;
- повертає деградований `verification`-об’єкт зі статусом `unavailable`, якщо OpenAI verification не виконалась;
- має fallback, якщо не вдалося прочитати `ESTIMATE_INSTRUCTIONS.md`.

Файл:

- [src/app/api/admin/estimates/verify/route.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/api/admin/estimates/verify/route.ts)

Ефект:

- у браузері більше не має бути червоного `500` як критичної поломки всього сценарію;
- генерація кошторису не маскується помилкою verify.

## 4. V2 тепер правильно читає verify response

V2 controller нормалізує відповідь:

- якщо API повернув `{ verification: {...} }`, береться inner object;
- якщо API повернув плоский об’єкт, використовується він.

Файл:

- [src/app/ai-estimate-v2/_lib/use-controller.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/ai-estimate-v2/_lib/use-controller.ts)

Ефект:

- score/issues/summary мають відображатися коректно.

## 5. Додано guard на порожній фінальний estimate

Якщо генерація завершилась без валідних секцій, V2 тепер:

- не показує мовчки нульовий результат;
- ставить явну помилку в UI.

Файл:

- [src/app/ai-estimate-v2/_lib/use-controller.ts](/Users/admin/Igor-Shiba/metrum-group/src/app/ai-estimate-v2/_lib/use-controller.ts)

Ефект:

- легше відрізнити "генерація не дала валідних позицій" від "кошторис реально нульовий".

---

## Поточний висновок

Було закрито 2 найбільш імовірні технічні причини нульового кошторису:

1. втрата площі між V2 UI і backend payload;
2. перетворення AI-чисел у `0` через `Number(...)`.

Окремо було прибрано secondary-problem:

3. `verify` більше не повинен ламати UX помилкою `500`.

---

## Що перевіряти після повторного тесту

Після повторного запуску V2 треба перевірити:

1. Чи зник `500` на `/api/admin/estimates/verify`.
2. Чи з’явився ненульовий `summary.totalBeforeDiscount`.
3. Чи є секції та items у фінальному результаті.
4. Чи лишається окрема помилка саме по секції `Оздоблення`.

---

## Якщо проблема повториться

Тоді наступний крок:

- знімати конкретний server-side log по `MasterEstimateAgent` для секції `Оздоблення`;
- дивитися raw AI response для finishing section;
- перевіряти, чи не повертає модель порожній `items[]` або невалідну JSON-структуру саме для цієї секції.

Тобто після цих правок головною підозрою вже буде не V2 payload і не verify, а конкретний section-generation failure у finishing pipeline.

---

## Додатково

Швидкі перевірки:

- `tsc --noEmit` у репозиторії падає на старих тестах у `src/lib/__tests__/auth-utils.test.ts`;
- це не виглядає пов’язаним з внесеними змінами;
- `eslint` не стартує через конфіг проєкту під ESLint v9.
