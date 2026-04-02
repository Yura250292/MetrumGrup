# План покращення AI генерації кошторисів

## 🔍 Поточна проблема

**Симптоми:**
- AI генерує занадто мало позицій для повного будинку
- Приклад: замість 150-200+ позицій виходить 40-60
- Недостатня деталізація по категоріях робіт

**Виявлені причини:**

1. **Конфлікт у промпті:**
   - Основний промпт каже "мінімум 40 позицій"
   - Шаблон `house_full` каже "120-200+ позицій"
   - AI вибирає менше число

2. **Недостатньо контексту:**
   - Користувач просто завантажує PDF і вибирає "повний будинок"
   - AI не знає: скільки поверхів, кімнат, чи є підвал, гараж і т.д.

3. **Занадто загальні категорії:**
   - 17 категорій робіт - це мало для повного будинку
   - Потрібно розбити на підкатегорії

---

## 🚀 Рішення 1: Wizard з питаннями (найкраще рішення)

### Концепція

Перед генерацією показати користувачу форму з детальними питаннями про проект.

### Реалізація

**Файл:** `/src/app/admin/estimates/ai-generate/page.tsx`

Додати новий стейт:
```typescript
const [wizardStep, setWizardStep] = useState<'upload' | 'wizard' | 'generating' | 'result'>('upload');
const [projectDetails, setProjectDetails] = useState({
  // Загальна інформація
  buildingType: 'house', // house | apartment | office | commercial
  totalArea: '',

  // Для будинків
  floors: 1,
  hasBasement: false,
  hasAttic: false,
  hasGarage: false,
  rooms: {
    bedrooms: 0,
    bathrooms: 0,
    livingRooms: 1,
    kitchen: 1,
  },

  // Конструкція
  wallMaterial: 'gas_block', // gas_block | brick | wood | panel
  roofType: 'pitched', // pitched | flat
  foundationType: 'strip', // strip | slab | pile

  // Стадія будівництва
  currentStage: 'foundation', // foundation | walls | roof | finishing
  targetStage: 'turnkey', // foundation | shell | turnkey

  // Інженерія
  hasHeating: true,
  heatingType: 'gas', // gas | electric | solid_fuel
  hasWaterSupply: true,
  hasSewerage: true,
  hasElectricity: true,

  // Оздоблення
  finishLevel: 'standard', // economy | standard | premium
  ceilingHeight: 2.7,

  // Додатково
  specialRequirements: '', // текстове поле
});
```

### UI Wizard (3 кроки)

**Крок 1: Загальна інформація**
```tsx
<Card>
  <h3>Крок 1 з 3: Загальна інформація</h3>

  <Select value={projectDetails.buildingType} onChange={...}>
    <option value="house">Приватний будинок</option>
    <option value="apartment">Квартира</option>
    <option value="office">Офіс</option>
    <option value="commercial">Комерційне приміщення</option>
  </Select>

  <Input label="Загальна площа (м²)" type="number" />

  {projectDetails.buildingType === 'house' && (
    <>
      <Input label="Кількість поверхів" type="number" min="1" max="4" />

      <div className="flex gap-4">
        <Checkbox label="Підвал" />
        <Checkbox label="Горище/мансарда" />
        <Checkbox label="Гараж" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Спальні" type="number" />
        <Input label="Санвузли" type="number" />
        <Input label="Вітальні" type="number" />
        <Input label="Кухні" type="number" />
      </div>
    </>
  )}
</Card>
```

**Крок 2: Конструкція та інженерія**
```tsx
<Card>
  <h3>Крок 2 з 3: Конструкція та інженерія</h3>

  <Select label="Матеріал стін">
    <option value="gas_block">Газоблок</option>
    <option value="brick">Цегла</option>
    <option value="wood">Дерево (зруб)</option>
    <option value="panel">Панельний</option>
  </Select>

  <Select label="Тип даху">
    <option value="pitched">Скатний (2-4 скати)</option>
    <option value="flat">Плоский</option>
  </Select>

  <Select label="Тип фундаменту">
    <option value="strip">Стрічковий</option>
    <option value="slab">Плитний</option>
    <option value="pile">Пальовий</option>
  </Select>

  <h4>Інженерні системи</h4>
  <Checkbox label="Опалення" checked={projectDetails.hasHeating} />
  {projectDetails.hasHeating && (
    <RadioGroup label="Тип опалення">
      <Radio value="gas">Газове</Radio>
      <Radio value="electric">Електричне</Radio>
      <Radio value="solid_fuel">Твердопаливне</Radio>
    </RadioGroup>
  )}

  <Checkbox label="Водопостачання" />
  <Checkbox label="Каналізація" />
  <Checkbox label="Електрика" />
</Card>
```

**Крок 3: Стадія та оздоблення**
```tsx
<Card>
  <h3>Крок 3 з 3: Стадія та оздоблення</h3>

  <Select label="Поточна стадія будівництва">
    <option value="planning">Планування (котлован)</option>
    <option value="foundation">Фундамент готовий</option>
    <option value="walls">Стіни зведені</option>
    <option value="roof">Дах готовий</option>
    <option value="rough">Чорнові роботи завершені</option>
  </Select>

  <Select label="До якої стадії робити кошторис">
    <option value="foundation">Тільки фундамент</option>
    <option value="shell">Коробка під дах</option>
    <option value="rough">З чорновими роботами</option>
    <option value="turnkey">Повністю під ключ</option>
  </Select>

  <Select label="Рівень оздоблення">
    <option value="economy">Економ (базові матеріали)</option>
    <option value="standard">Стандарт (середній клас)</option>
    <option value="premium">Преміум (якісні матеріали)</option>
  </Select>

  <Input label="Висота стелі (м)" type="number" step="0.1" defaultValue="2.7" />

  <Textarea label="Особливі побажання" rows={4}
    placeholder="Наприклад: тепла підлога у всіх кімнатах, натяжні стелі, дерев'яні підвіконня..." />
</Card>
```

### Модифікація промпту з wizard даними

```typescript
// У функції generate() після wizard'а
const wizardContext = `
# ДЕТАЛЬНА ІНФОРМАЦІЯ ПРО ПРОЕКТ (від користувача через wizard):

**Тип об'єкту:** ${projectDetails.buildingType === 'house' ? 'Приватний будинок' : '...'}
**Загальна площа:** ${projectDetails.totalArea} м²

${projectDetails.buildingType === 'house' ? `
**Поверховість:** ${projectDetails.floors} поверх(ів)
${projectDetails.hasBasement ? '✓ Є підвал' : ''}
${projectDetails.hasAttic ? '✓ Є горище/мансарда' : ''}
${projectDetails.hasGarage ? '✓ Є гараж' : ''}

**Кімнати:**
- Спальні: ${projectDetails.rooms.bedrooms}
- Санвузли: ${projectDetails.rooms.bathrooms}
- Вітальні: ${projectDetails.rooms.livingRooms}
- Кухні: ${projectDetails.rooms.kitchen}
` : ''}

**Конструкція:**
- Матеріал стін: ${projectDetails.wallMaterial}
- Тип даху: ${projectDetails.roofType}
- Тип фундаменту: ${projectDetails.foundationType}
- Висота стелі: ${projectDetails.ceilingHeight} м

**Інженерні системи:**
${projectDetails.hasHeating ? `✓ Опалення (${projectDetails.heatingType})` : ''}
${projectDetails.hasWaterSupply ? '✓ Водопостачання' : ''}
${projectDetails.hasSewerage ? '✓ Каналізація' : ''}
${projectDetails.hasElectricity ? '✓ Електрика' : ''}

**Стадії:**
- Поточна: ${projectDetails.currentStage}
- Цільова: ${projectDetails.targetStage}

**Рівень оздоблення:** ${projectDetails.finishLevel}

${projectDetails.specialRequirements ? `
**Особливі вимоги:**
${projectDetails.specialRequirements}
` : ''}

# ОБОВ'ЯЗКОВО ВРАХОВУЙ ЦЮ ІНФОРМАЦІЮ!

На основі цих даних створи МАКСИМАЛЬНО ДЕТАЛЬНИЙ кошторис.

**Орієнтовна кількість позицій для цього проекту:**
${calculateExpectedItems(projectDetails)}

`;

// Додати до основного промпту
const fullPrompt = wizardContext + mainPrompt;
```

### Функція розрахунку очікуваної кількості позицій

```typescript
function calculateExpectedItems(details: ProjectDetails): string {
  let min = 40;
  let max = 60;

  // Базова кількість залежно від типу
  if (details.buildingType === 'house') {
    min = 80;
    max = 120;

    // +20-30 позицій за кожен поверх понад 1
    if (details.floors > 1) {
      const extraFloors = details.floors - 1;
      min += extraFloors * 20;
      max += extraFloors * 30;
    }

    // +15-20 за підвал
    if (details.hasBasement) {
      min += 15;
      max += 20;
    }

    // +10-15 за гараж
    if (details.hasGarage) {
      min += 10;
      max += 15;
    }

    // +5 за кожну додаткову кімнату
    const totalRooms = details.rooms.bedrooms + details.rooms.bathrooms +
                      details.rooms.livingRooms + details.rooms.kitchen;
    min += totalRooms * 3;
    max += totalRooms * 5;

    // Залежно від цільової стадії
    if (details.targetStage === 'turnkey') {
      min *= 1.5;
      max *= 1.8;
    } else if (details.targetStage === 'shell') {
      min *= 0.6;
      max *= 0.7;
    }
  }

  return `${Math.round(min)}-${Math.round(max)} позицій`;
}
```

---

## 🚀 Рішення 2: Покращення промпту (швидке, але менш ефективне)

### Зміни в основному промпті

**Файл:** `/src/app/api/admin/estimates/generate/route.ts`

**Зміна 1: Динамічний мінімум позицій**

```typescript
// Замість фіксованого "40-60 позицій"
const expectedItemsRange = calculateExpectedItemsByTemplate(template, area);

const prompt = `
...
## ВАЖЛИВО ПРО КІЛЬКІСТЬ ПОЗИЦІЙ:
${expectedItemsRange}

**КРИТИЧНО:** Це НЕ рекомендація, а МІНІМАЛЬНА вимога. Краще більше деталей, ніж менше.
...
`;
```

**Функція розрахунку:**
```typescript
function calculateExpectedItemsByTemplate(template: string, area: string): string {
  const areaNum = parseFloat(area) || 100;

  switch(template) {
    case 'foundation':
      return `Мінімум 25-40 позицій (тільки фундамент)`;

    case 'shell':
      return `Мінімум 60-90 позицій (коробка без оздоблення)`;

    case 'turnkey':
      const minApt = Math.max(60, Math.floor(areaNum * 0.8));
      const maxApt = Math.max(90, Math.floor(areaNum * 1.2));
      return `Мінімум ${minApt}-${maxApt} позицій (повний ремонт квартири ${areaNum}м²)`;

    case 'house_full':
      const minHouse = Math.max(120, Math.floor(areaNum * 1.2));
      const maxHouse = Math.max(200, Math.floor(areaNum * 2.0));
      return `Мінімум ${minHouse}-${maxHouse} позицій (повний будинок ${areaNum}м²)

**РОЗБИВКА ПО КАТЕГОРІЯХ (орієнтовно):**
- Фундамент та нульовий цикл: 15-25 позицій
- Стіни та перегородки: 20-35 позицій
- Перекриття та дах: 25-40 позицій
- Вікна та двері: 10-15 позицій
- Фасадні роботи: 15-25 позицій
- Електрика: 15-25 позицій
- Сантехніка та опалення: 20-30 позицій
- Внутрішнє оздоблення: 30-50+ позицій

**ВАЖЛИВО:** Кожна підкатегорія повинна мати детальний розпис матеріалів та робіт.`;

    case 'apartment_rough':
      return `Мінімум 40-60 позицій (чорнові роботи ${areaNum}м²)`;

    default:
      return `Мінімум 50-80 позицій`;
  }
}
```

**Зміна 2: Додати в промпт приклад розгорнутого кошторису**

```typescript
const detailedExample = `
# ПРИКЛАД ДЕТАЛЬНОГО РОЗПИСУ (для будинку):

## Секція "Електрика" - НЕ менше 15-20 позицій:

✓ Кабель ВВГнг 3×2.5 (для розеток) - метри
✓ Кабель ВВГнг 3×1.5 (для освітлення) - метри
✓ Кабель ВВГнг 3×4 (для потужних споживачів) - метри
✓ Гофра ПВХ 16мм - метри
✓ Гофра ПВХ 20мм - метри
✓ Підрозетники (бетон) - штуки
✓ Розетки Schneider Electric Asfora - штуки
✓ Вимикачі Schneider Electric Asfora 1-клавішні - штуки
✓ Вимикачі Schneider Electric Asfora 2-клавішні - штуки
✓ Розподільні коробки - штуки
✓ Електрощит на 12 модулів - штука
✓ Автоматичні вимикачі 16А - штуки
✓ Автоматичні вимикачі 25А - штуки
✓ Автоматичні вимикачі 40А - штуки
✓ ПЗВ (диференційний автомат) - штуки
✓ DIN-рейка - метри
✓ Кабель-канал 40×40 - метри
✓ Кабель-канал 60×60 - метри
✓ Клеми Wago - набори
✓ Ізолента - рулони

+ Роботи (окремими позиціями):
✓ Штроблення стін під проводку - м.п.
✓ Прокладка кабелю в гофрі - м.п.
✓ Встановлення підрозетників - штук
✓ Монтаж розеток та вимикачів - штук
✓ Збірка електрощита - шт
✓ та ін.

## Секція "Штукатурні роботи" - НЕ менше 10 позицій:

✓ Штукатурка машинна МП-75 30кг - мішки
✓ Грунтовка Ceresit CT 17 10л - каністри
✓ Маяки штукатурні 6мм - штуки
✓ Кутники перфоровані - метри
✓ Сітка скловолоконна 5×5мм - м²
✓ Ротбанд для відкосів 30кг - мішки

+ Роботи:
✓ Грунтування стін - м²
✓ Встановлення маяків - м.п.
✓ Штукатурка стін машинна - м²
✓ Штукатурка відкосів вручну - м.п.

**КОЖНА категорія повинна бути настільки ж детальною!**
`;
```

---

## 🚀 Рішення 3: Двоетапна генерація з уточненням

### Концепція

1. Перша генерація - швидкий аналіз та структура
2. Показ користувачу структури з питаннями
3. Друга генерація - детальний кошторис

### Реалізація

**Етап 1: Швидкий аналіз**

```typescript
const analysisPrompt = `
Проаналізуй завантажені файли та відповідь у JSON:

{
  "detectedArea": "площа з документів або null",
  "detectedRooms": ["кімната 1", "кімната 2"],
  "detectedMaterials": ["газоблок", "цегла"],
  "suggestedCategories": ["фундамент", "стіни", "дах"],
  "questions": [
    {
      "question": "Чи потрібно робити підвал?",
      "options": ["Так", "Ні"],
      "importance": "high"
    }
  ],
  "estimatedComplexity": "high", // low | medium | high
  "estimatedItemsCount": "120-180"
}
`;
```

**Етап 2: Показ питань користувачу**

```tsx
<Card>
  <h3>AI проаналізував файли. Будь ласка, уточніть деталі:</h3>

  {analysis.questions.map(q => (
    <div key={q.question}>
      <Label>{q.question}</Label>
      <RadioGroup>
        {q.options.map(opt => <Radio value={opt}>{opt}</Radio>)}
      </RadioGroup>
    </div>
  ))}

  <p>Очікувана кількість позицій: {analysis.estimatedItemsCount}</p>

  <Button onClick={() => generateDetailed(userAnswers)}>
    Згенерувати детальний кошторис
  </Button>
</Card>
```

**Етап 3: Детальна генерація з врахуванням відповідей**

---

## 🚀 Рішення 4: Шаблони-приклади для навчання AI

### Завантаження прикладів у промпт

```typescript
// Додати в промпт реальні приклади з папки /teach
const exampleEstimates = await loadExampleEstimates();

const promptWithExamples = `
...основний промпт...

# РЕАЛЬНІ ПРИКЛАДИ КОШТОРИСІВ METRUM GROUP (для референсу):

${exampleEstimates.map(ex => `
## Приклад ${ex.number}: ${ex.title}
- Площа: ${ex.area} м²
- Кількість позицій: ${ex.itemsCount}
- Структура секцій: ${ex.sections.join(', ')}

Ключові позиції (перші 20):
${ex.topItems.slice(0, 20).map(item => `- ${item.description}: ${item.quantity} ${item.unit}`).join('\n')}
`).join('\n\n')}

**НА ОСНОВІ ЦИХ ПРИКЛАДІВ створи АНАЛОГІЧНО ДЕТАЛЬНИЙ кошторис.**
`;
```

---

## 📊 Рекомендована послідовність впровадження

### Етап 1 (швидко, 2-3 години):
✅ **Рішення 2** - Покращення промпту
- Динамічний розрахунок мінімуму позицій
- Детальні приклади розпису по категоріях
- Чіткі вказівки для кожного шаблону

### Етап 2 (середньо, 6-8 годин):
✅ **Рішення 4** - Додати приклади з /teach
- Парсинг Excel кошторисів
- Додавання структури в промпт
- Покращення якості через few-shot learning

### Етап 3 (складно, 12-16 годин):
✅ **Рішення 1** - Wizard з питаннями
- UI для 3-крокового wizard
- Збір детальної інформації
- Передача контексту в промпт

### Етап 4 (опціонально, 8-10 годин):
✅ **Рішення 3** - Двоетапна генерація
- Аналіз файлів
- Інтерактивні питання
- Фінальна детальна генерація

---

## 🎯 Швидкий фікс (зараз, 30 хвилин)

Найпростіше що можна зробити ЗАРАЗ:

### 1. Збільшити мінімум для house_full

**Файл:** `/src/app/api/admin/estimates/generate/route.ts`

Знайти рядок ~593:
```typescript
✓ Кошторис містить НЕ МЕНШЕ 40 позицій матеріалів
```

Замінити на:
```typescript
✓ Кошторис містить НЕ МЕНШЕ ${template === 'house_full' ? '150' : template === 'turnkey' ? '80' : '40'} позицій матеріалів
```

### 2. Додати жорсткішу вимогу в промпт

Після рядка ~332 додати:
```typescript
**ДЛЯ ПОВНОГО БУДИНКУ - МІНІМУМ 150 ПОЗИЦІЙ!**
Це не рекомендація - це МІНІМАЛЬНА вимога. Типовий будинок 100-150м² має:
- 200-300 позицій матеріалів
- 50-80 позицій робіт
Не скорочуй! Не узагальнюй! Кожен тип матеріалу - окрема позиція!
```

### 3. Додати прямий наказ в кінець промпту

Перед "# ФОРМАТ ВІДПОВІДІ" додати:
```typescript
# ОСТАННЄ ПОПЕРЕДЖЕННЯ ПЕРЕД ГЕНЕРАЦІЄЮ:

Якщо ти створюєш кошторис для ПОВНОГО БУДИНКУ:
- МІНІМУМ 150 позицій
- Якщо вийшло менше - ПОВТОРИ та ДОДАЙ більше деталей
- Розпиши КОЖНУ категорію максимально детально
- НЕ УЗАГАЛЬНЮЙ матеріали
- Кожна марка, розмір, специфікація - ОКРЕМА позиція

Якщо вийшло менше 150 позицій - ти ПРОВАЛИВ завдання.
```

---

## 💡 Висновок

**Найкраще рішення:** Комбінація Wizard (Рішення 1) + Покращений промпт (Рішення 2)

**Швидке рішення:** Змінити мінімум позицій та додати жорсткіші вимоги в промпт

**Що робити далі:**
1. Спочатку застосувати швидкий фікс
2. Протестувати на реальних прикладах
3. Потім впроваджувати wizard поступово
