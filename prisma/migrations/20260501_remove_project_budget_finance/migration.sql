-- Phase 3.1: Project.totalBudget більше не йде у FinanceEntry.
-- Поле "Бюджет, ₴" при створенні проекту — приблизна оцінка на старті,
-- вона змінюється під час робіт. Реальний план — STAGE_AUTO записи через
-- publish дерева етапів. PROJECT_BUDGET тільки засмічував зведення.
--
-- Видаляємо ВСІ існуючі PROJECT_BUDGET записи. Сам source-enum значення
-- лишається у Prisma schema для backward compat — але тепер ці записи
-- не створюються.

DELETE FROM "finance_entries"
WHERE "source" = 'PROJECT_BUDGET';
