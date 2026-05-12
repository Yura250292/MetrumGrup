-- Safe Finance Migration Phase 5.5 (foreman-flow): per-item financial intent.
-- Менеджер при approve обирає для кожної позиції: борг (COMMITTED) чи
-- вже оплачено (ACTUAL). Зберігається стейт до approve, щоб менеджер
-- міг готувати рішення поетапно.
--
-- Додатково: costCodeId для коректної агрегації у budget-matrix.

CREATE TYPE "ForemanFinanceIntent" AS ENUM ('COMMITTED', 'ACTUAL');

ALTER TABLE "foreman_report_items"
  ADD COLUMN "costCodeId" TEXT,
  ADD COLUMN "financeIntent" "ForemanFinanceIntent",
  ADD COLUMN "managerNote" TEXT;

ALTER TABLE "foreman_report_items"
  ADD CONSTRAINT "foreman_report_items_costCodeId_fkey"
  FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "foreman_report_items_costCodeId_idx"
  ON "foreman_report_items" ("costCodeId");
