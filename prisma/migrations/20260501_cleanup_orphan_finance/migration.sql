-- Cleanup для проєктів видалених до фіксу видалення (включно з Раковським).
-- До цього моменту FinanceEntry.project мав onDelete: SetNull, тому при
-- видаленні проєкту записи лишалися як projectId=NULL і фігурували у
-- зведенні фінансування як "projectless" — ламали /admin-v2/financing.
--
-- Видаляємо derived-записи (STAGE_AUTO / ESTIMATE_AUTO / PROJECT_BUDGET)
-- з projectId=NULL — вони BY DEFINITION належали проєкту і не можуть
-- існувати без нього.
-- MANUAL projectId=NULL не чіпаємо — це валідний firm-level запис у папці.

DELETE FROM "finance_entries"
WHERE "projectId" IS NULL
  AND "isDerived" = true;

-- Також почистимо порожні mirror-папки, якщо такі залишилися
-- (mirroredFromProjectId на Folder уже Cascade — але про всяк випадок).
DELETE FROM "folders"
WHERE "mirroredFromProjectId" IS NOT NULL
  AND "mirroredFromProjectId" NOT IN (SELECT "id" FROM "projects");
