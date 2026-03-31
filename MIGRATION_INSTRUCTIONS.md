# 🔧 Інструкція: Застосування міграції податкової системи на Production

## Що робить ця міграція?

Додає детальну систему розрахунку податків:
- Нові поля в таблиці `estimates`: `pdvAmount`, `esvAmount`, `militaryTaxAmount`, `profitTaxAmount`, `unifiedTaxAmount`, `pdfoAmount`
- Нова таблиця `tax_records` для аудиту податкових розрахунків
- Метадані розрахунків: `taxCalculationDetails`, `taxCalculatedAt`

## ⚠️ ВАЖЛИВО: Застосуйте міграцію ОДРАЗУ після деплою

Код вже очікує що нові поля існують в БД. Без міграції сайт **не буде працювати**.

---

## 🚀 Варіант 1: Через Vercel CLI (Рекомендовано)

### Крок 1: Встановіть Vercel CLI (якщо ще немає)
```bash
npm install -g vercel
```

### Крок 2: Залогіньтесь
```bash
vercel login
```

### Крок 3: Перейдіть в папку проекту
```bash
cd /Users/admin/Igor-Shiba/metrum-group
```

### Крок 4: Виконайте міграцію на production
```bash
vercel env pull .env.production  # Завантажить DATABASE_URL з production
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-) \
  npx prisma db execute --file prisma/migrations/20250331_add_tax_breakdown_fields/migration.sql
```

### Крок 5: Перевірте що міграція застосувалась
```bash
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-) \
  npx prisma db pull
```

---

## 🌐 Варіант 2: Через Vercel Dashboard

### Крок 1: Відкрийте проект на Vercel
1. Зайдіть на https://vercel.com
2. Оберіть проект "MetrumGrup"
3. Перейдіть в **Settings** → **Environment Variables**

### Крок 2: Скопіюйте DATABASE_URL
1. Знайдіть змінну `DATABASE_URL`
2. Скопіюйте її значення (наприклад: `postgres://user:pass@host:5432/db`)

### Крок 3: Застосуйте міграцію локально до production БД
```bash
export DATABASE_URL="вставте сюди URL з кроку 2"
npx prisma db execute --file prisma/migrations/20250331_add_tax_breakdown_fields/migration.sql
```

---

## 🔍 Перевірка успішності міграції

### Перевірте що нові поля з'явились:
```bash
# Використайте DATABASE_URL з production
psql $DATABASE_URL -c "\d estimates" | grep -E "(pdvAmount|esvAmount|militaryTaxAmount)"
```

### Перевірте що таблиця tax_records створена:
```bash
psql $DATABASE_URL -c "\dt tax_records"
```

---

## 🎉 Після успішної міграції

1. ✅ Сайт запрацює без помилок
2. ✅ В кошторисах з'явиться детальний розподіл податків
3. ✅ Фінансовий директор зможе бачити:
   - ПДВ (20%)
   - ЄСВ (22%)
   - ПДФО (18%)
   - Військовий збір (1.5%)
   - Податок на прибуток (18%)
   - Чистий прибуток після податків
   - Ефективну податкову ставку

---

## ❌ Якщо щось пішло не так

### Скасувати міграцію (видалити нові поля):
```sql
-- УВАГА: Це видалить всі дані про податки!
ALTER TABLE estimates
  DROP COLUMN IF EXISTS pdvAmount,
  DROP COLUMN IF EXISTS esvAmount,
  DROP COLUMN IF EXISTS militaryTaxAmount,
  DROP COLUMN IF EXISTS profitTaxAmount,
  DROP COLUMN IF EXISTS unifiedTaxAmount,
  DROP COLUMN IF EXISTS pdfoAmount,
  DROP COLUMN IF EXISTS taxCalculationDetails,
  DROP COLUMN IF EXISTS taxCalculatedAt;

DROP TABLE IF EXISTS tax_records;
```

---

## 📞 Питання?

Якщо виникли проблеми:
1. Перевірте що DATABASE_URL вказує на правильну БД
2. Перевірте що у користувача БД є права на CREATE TABLE та ALTER TABLE
3. Переконайтесь що міграційний SQL файл існує в `prisma/migrations/20250331_add_tax_breakdown_fields/migration.sql`
