-- STAGE_AUTO джерело FinanceEntry — для записів, які upsert-аться з полів
-- ProjectStageRecord (planVolume × planUnitPrice → PLAN EXPENSE,
-- factVolume × factUnitPrice → FACT EXPENSE). Дозволяє відрізнити їх
-- від MANUAL (швидкі довезення/ручні записи) і пере-генерувати при
-- наступних змінах без дублювання.

ALTER TYPE "FinanceEntrySource" ADD VALUE 'STAGE_AUTO';
