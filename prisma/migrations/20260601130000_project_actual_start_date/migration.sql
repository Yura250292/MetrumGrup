-- Project lifecycle alignment (P1): фактична дата старту проєкту.
-- Pure additive: nullable column. No DROP/RENAME/NOT NULL.
--
-- `projects.startDate`       = планова дата старту (форма «Новий проект»).
-- `projects.actualStartDate` = фактичний старт, ставиться при activate, коли
--                              план робіт заморожено (POST .../activate).
--
-- Backfill винесено в окремий idempotent tsx-скрипт (Крок 11), щоб не чіпати
-- prod-дані всередині DDL-міграції.

ALTER TABLE "projects"
  ADD COLUMN "actualStartDate" TIMESTAMP(3);
