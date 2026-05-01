-- Phase 4.2: бекфілл категорій STAGE_AUTO записів.
--
-- До цієї міграції writer ставив `category = 'materials'` для EXPENSE і
-- `category = 'services'` для INCOME. Останнє — interesting bug: 'services'
-- взагалі немає в FINANCE_CATEGORIES (валідні INCOME-категорії: investment /
-- client_advance / other_income), тож такі записи не матчилися на категорійні
-- фільтри/звіти.
--
-- Дзеркалить логіку lib/projects/stage-finance-categorization.ts.

-- INCOME усіх стейджів → client_advance.
UPDATE "finance_entries"
SET "category" = 'client_advance'
WHERE source = 'STAGE_AUTO'
  AND type = 'INCOME';

-- EXPENSE — мапимо за стейджем + ставимо costType якщо не задано.
UPDATE "finance_entries" fe
SET
  "category" = CASE psr.stage
      WHEN 'DESIGN'   THEN 'design'
      WHEN 'HANDOVER' THEN 'admin'
      ELSE 'construction'
  END,
  "costType" = COALESCE(fe."costType", CASE psr.stage
      WHEN 'DESIGN'      THEN 'SUBCONTRACT'::"CostType"
      WHEN 'ENGINEERING' THEN 'SUBCONTRACT'::"CostType"
      WHEN 'HANDOVER'    THEN 'OVERHEAD'::"CostType"
      WHEN 'FOUNDATION'  THEN 'MATERIAL'::"CostType"
      WHEN 'WALLS'       THEN 'MATERIAL'::"CostType"
      WHEN 'ROOF'        THEN 'MATERIAL'::"CostType"
      WHEN 'FINISHING'   THEN 'MATERIAL'::"CostType"
      ELSE NULL
  END)
FROM "project_stage_records" psr
WHERE fe."stageRecordId" = psr.id
  AND fe.source = 'STAGE_AUTO'
  AND fe.type = 'EXPENSE';
