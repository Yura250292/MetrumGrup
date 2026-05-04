-- Розбиваємо ПІБ на окремі поля. fullName лишається для зворотньої сумісності.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "middleName" TEXT;

-- Backfill: розбиваємо існуючий fullName за пробілами (Прізвище Імʼя По-батькові).
-- Перший токен - lastName, другий - firstName, третій - middleName. Якщо інших
-- токенів немає - лишаємо NULL. NULLIF щоб порожні рядки не записувалися.
UPDATE "employees"
SET
  "lastName"   = NULLIF(split_part("fullName", ' ', 1), ''),
  "firstName"  = NULLIF(split_part("fullName", ' ', 2), ''),
  "middleName" = NULLIF(split_part("fullName", ' ', 3), '')
WHERE "fullName" IS NOT NULL
  AND "lastName" IS NULL
  AND "firstName" IS NULL
  AND "middleName" IS NULL;
