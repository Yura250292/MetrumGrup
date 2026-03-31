# Налаштування Фінансового Директора

Інструкція як налаштувати функціонал фінансового директора в системі Metrum Group.

---

## 🔧 Крок 1: Встановіть залежності для скриптів

```bash
npm install -D tsx
```

---

## 👤 Крок 2: Створіть або оновіть користувача з роллю FINANCIER

### Варіант А: Оновити існуючого користувача

```bash
npx tsx scripts/add-financier-role.ts email@example.com
```

**Приклад:**
```bash
npx tsx scripts/add-financier-role.ts financier@metrum.group
```

**Вивід:**
```
📋 Поточний користувач:
   Ім'я: Фінансовий Директор
   Email: financier@metrum.group
   Роль: MANAGER

✅ Роль успішно оновлено!
   Нова роль: FINANCIER

🔐 Тепер користувач може:
   • Заходити на /admin/finance
   • Переглядати кошториси
   • Налаштовувати рентабельність, податки, логістику
   • Створювати та використовувати шаблони
```

### Варіант Б: Створити нового користувача через SQL

Підключіться до PostgreSQL:
```bash
psql -U your_user -d metrum_group
```

Виконайте:
```sql
-- Створити нового користувача (пароль: password123)
INSERT INTO users (id, email, password, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'financier@metrum.group',
  '$2a$10$rJYMZqC8c7Y5XqJxGqJ0xeLsM0vK5KXqJxGqJ0xeLsM0vK5KXqJxGq', -- bcrypt hash of "password123"
  'Фінансовий Директор',
  'FINANCIER',
  true,
  NOW(),
  NOW()
);
```

**Або оновити існуючого:**
```sql
UPDATE users
SET role = 'FINANCIER'
WHERE email = 'your-email@example.com';
```

---

## 📊 Крок 3: Підготуйте тестовий кошторис

### Варіант А: Встановити статус для існуючого кошториса

```bash
npx tsx scripts/set-estimate-for-finance.ts EST-0001
```

**Вивід:**
```
📋 Кошторис:
   Номер: EST-0001
   Назва: Будівництво будинку
   Проєкт: Котедж на Лісовій
   Поточний статус: DRAFT

✅ Статус успішно оновлено!
   Новий статус: FINANCE_REVIEW

💼 Тепер цей кошторис:
   • Видимий фінансисту на /admin/finance
   • Готовий до налаштування фінансових параметрів
   • URL: /admin/finance/configure/cuid123...
```

### Варіант Б: Встановити статус для останнього кошториса

```bash
npx tsx scripts/set-estimate-for-finance.ts latest
```

### Варіант В: Через SQL

```sql
UPDATE estimates
SET status = 'FINANCE_REVIEW'
WHERE number = 'EST-0001';
```

---

## ✅ Крок 4: Перевірте доступ

1. **Вийдіть та увійдіть знову** під користувачем з роллю FINANCIER

2. **Відкрийте сторінку фінансів:**
   ```
   http://localhost:3000/admin/finance
   ```

3. **Ви маєте побачити:**
   - Список кошторисів в статусі FINANCE_REVIEW
   - Фільтри: "На розгляді", "Затверджені", "Всі"
   - Таблицю з номером, назвою, проєктом, статусом, сумами
   - Кнопку "Налаштувати" для кожного кошториса

---

## 🎯 Крок 5: Протестуйте функціонал

### 5.1 Налаштування кошториса

1. Натисніть "Налаштувати" на кошторисі
2. Виберіть тип оплати (Готівка, ТОВ ПДВ, ФОП)
3. Встановіть глобальну рентабельність (слайдер 0-100%)
4. Додайте логістику (напр. 500 грн)
5. Опціонально: встановіть індивідуальну рентабельність на позиції
6. Перевірте живі розрахунки підсумків
7. Натисніть "Зберегти налаштування"

### 5.2 Шаблони

1. Перейдіть на `/admin/finance/templates`
2. Натисніть "Створити шаблон"
3. Заповніть:
   - Назва: "Стандарт 25% + ПДВ"
   - Тип оплати: ТОВ ПДВ 20%
   - Рентабельність: 25%
   - Логістика: 500
4. Збережіть шаблон
5. Поверніться до налаштування кошториса
6. Натисніть "Застосувати шаблон"
7. Виберіть створений шаблон

---

## 🐛 Вирішення проблем

### Проблема: "Немає кошторисів для огляду"

**Причина:** Немає кошторисів в статусі FINANCE_REVIEW

**Рішення:**
```bash
# Перевірити існуючі кошториси
psql -d metrum_group -c "SELECT number, title, status FROM estimates ORDER BY \"createdAt\" DESC LIMIT 5;"

# Встановити статус для кошториса
npx tsx scripts/set-estimate-for-finance.ts EST-0001
```

### Проблема: "Forbidden" при доступі до /admin/finance

**Причина:** Користувач не має роль FINANCIER

**Рішення:**
```bash
# Перевірити роль користувача
psql -d metrum_group -c "SELECT email, role FROM users WHERE email = 'your@email.com';"

# Оновити роль
npx tsx scripts/add-financier-role.ts your@email.com
```

### Проблема: API не повертає дані

**Причина:** Проблема з правами доступу або відсутність даних

**Рішення:**
```bash
# Перевірити логи
npm run dev

# Відкрити в браузері
http://localhost:3000/api/admin/estimates?status=FINANCE_REVIEW

# Має повернути JSON з масивом кошторисів
```

---

## 📝 Корисні SQL запити

### Переглянути всіх користувачів та їх ролі
```sql
SELECT email, name, role, "isActive"
FROM users
ORDER BY "createdAt" DESC;
```

### Переглянути всі кошториси та їх статуси
```sql
SELECT e.number, e.title, e.status, e."totalAmount", p.title as project
FROM estimates e
LEFT JOIN projects p ON e."projectId" = p.id
ORDER BY e."createdAt" DESC
LIMIT 10;
```

### Змінити статус кількох кошторисів
```sql
UPDATE estimates
SET status = 'FINANCE_REVIEW'
WHERE status = 'DRAFT'
AND "createdAt" > NOW() - INTERVAL '7 days';
```

### Видалити фінансові налаштування (для тестування)
```sql
UPDATE estimates
SET
  status = 'DRAFT',
  "logisticsCost" = 0,
  "taxAmount" = 0,
  "finalAmount" = "totalAmount",
  "financeReviewedById" = NULL,
  "financeReviewedAt" = NULL,
  "financeNotes" = NULL
WHERE number = 'EST-0001';

UPDATE estimate_items
SET
  "useCustomMargin" = false,
  "customMarginPercent" = NULL,
  "priceWithMargin" = 0,
  "marginAmount" = 0
WHERE "estimateId" IN (SELECT id FROM estimates WHERE number = 'EST-0001');
```

---

## 🎉 Готово!

Тепер ви можете повноцінно використовувати функціонал фінансового директора!

**Документація:**
- Повна документація: `FINANCIAL_DIRECTOR_FEATURE.md` (якщо існує)
- API документація: дивіться файли в `src/app/api/admin/`
- Компоненти: `src/app/admin/finance/`

**Питання?**
Звертайтеся до розробників або створіть issue в репозиторії.
