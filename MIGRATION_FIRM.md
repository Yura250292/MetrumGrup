# Migration: окрема фірма Metrum Studio

Додає таблицю `firms` + `firmId` FK на `users`, `projects`, `finance_entries`. Усі існуючі рядки backfill-ються до `metrum-group`. Metrum Studio створюється порожньою.

## Чому два кроки

`firmId` має NOT NULL semantics ціллю, але FK не може бути встановлений до існування рядків у `firms`. Тож:

1. Додаємо `firmId` як **nullable** + створюємо `Firm` модель → `db push`
2. Сідимо обидві фірми та робимо backfill
3. (Опційно) В наступній PR: робимо `firmId` NOT NULL з default → `db push` ще раз

## Кроки

### A. Push Firm model + nullable firmId колонок

```bash
npm run db:push
```

Це створить таблицю `firms` (порожню) і додасть nullable `firm_id` колонки до `users`, `projects`, `finance_entries`.

### B. Засідити фірми та backfill існуючі рядки

Через psql/Supabase SQL editor виконати:

```sql
INSERT INTO firms (id, slug, name, "isDefault", "createdAt", "updatedAt")
VALUES
  ('metrum-group',  'metrum-group',  'Metrum Group',  true,  NOW(), NOW()),
  ('metrum-studio', 'metrum-studio', 'Metrum Studio', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE users           SET firm_id = 'metrum-group' WHERE firm_id IS NULL;
UPDATE projects        SET firm_id = 'metrum-group' WHERE firm_id IS NULL;
UPDATE finance_entries SET firm_id = 'metrum-group' WHERE firm_id IS NULL;
```

Або просто запустити seed (на dev — повне очищення):

```bash
npm run db:seed
```

Для dev-користувача "Керівник студії":

```bash
SEED_DEV_USERS=true npm run db:seed
# логін: studio@metrum.dev / password123
```

### C. (опційно, наступна PR) Зробити firmId NOT NULL

Після успішного backfill — у `prisma/schema.prisma` поміняти:
```prisma
firmId String? @default("metrum-group")
firm   Firm?   @relation(...)
```
на:
```prisma
firmId String @default("metrum-group")
firm   Firm   @relation(...)
```
і повторити `npm run db:push`. Цей крок не блокує функціональність — поточний код вже стампає `firmId` при створенні нових сутностей.

## Призначення керівника студії

Для production:

```sql
UPDATE users
   SET role = 'MANAGER', firm_id = 'metrum-studio'
 WHERE email = 'EMAIL_КЕРІВНИКА@example.com';
```

Після наступного логіну сесія підхопить `firmId` і всі дашборди/списки автоматично заскопляться.

## Verification

```sql
-- Кількість метрум-груп проектів = довідник до міграції
SELECT COUNT(*) FROM projects WHERE firm_id = 'metrum-group';

-- Жодного "осиротілого" рядка
SELECT COUNT(*) FROM projects WHERE firm_id IS NULL;
SELECT COUNT(*) FROM finance_entries WHERE firm_id IS NULL;
SELECT COUNT(*) FROM users WHERE firm_id IS NULL;

-- Studio порожня (має бути 0 поки нічого не створили)
SELECT COUNT(*) FROM projects WHERE firm_id = 'metrum-studio';
```

## Smoke test

1. Логін як SUPER_ADMIN → `/admin-v2`: підсумки **ідентичні** до міграції.
2. Створити проект Metrum Studio через `/admin-v2/studio` → відкрити `/admin-v2/studio` → лише цей проект.
3. Логін як Studio директор → `/admin-v2`: бачить тільки Studio дані, бейдж "Metrum Studio" у хедері.
4. Studio директор по прямому URL Group-проекту → 404.
5. SUPER_ADMIN на `/admin-v2`: підсумки **досі** не включають Studio дані (Group default scope).

## Rollback

Якщо щось пішло не так:

```sql
-- Видалити FK і колонки (UNDO)
ALTER TABLE finance_entries DROP COLUMN firm_id;
ALTER TABLE projects        DROP COLUMN firm_id;
ALTER TABLE users           DROP COLUMN firm_id;
DROP TABLE firms;
```

Потім відкотити код через `git revert`. Дані не постраждають — `firmId` був ізольованою колонкою.
