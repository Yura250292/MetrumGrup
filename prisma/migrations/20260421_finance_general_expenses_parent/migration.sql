-- Restructure system finance folders into a single "Загальні витрати" parent
-- with 3 children: Постійні витрати, Змінні витрати, Витрати офісу.

-- 1. Create new parent "Загальні витрати"
INSERT INTO "folders" (id, domain, name, "parentId", "sortOrder", "isSystem", slug, "createdAt", "updatedAt")
VALUES ('fld_sys_general_expenses', 'FINANCE', 'Загальні витрати', NULL, 0, true, 'general-expenses', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Create new "Змінні витрати" (variable expenses) as child of general
INSERT INTO "folders" (id, domain, name, "parentId", "sortOrder", "isSystem", slug, "createdAt", "updatedAt")
VALUES ('fld_sys_variable_expenses', 'FINANCE', 'Змінні витрати', 'fld_sys_general_expenses', 1, true, 'variable-expenses', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Move existing "Постійні витрати" (company-expenses) under new parent, sortOrder 0
UPDATE "folders"
SET "parentId" = 'fld_sys_general_expenses', "sortOrder" = 0, "updatedAt" = NOW()
WHERE id = 'fld_sys_company_expenses';

-- 4. Move existing "Витрати офісу" under new parent, sortOrder 2
UPDATE "folders"
SET "parentId" = 'fld_sys_general_expenses', "sortOrder" = 2, "updatedAt" = NOW()
WHERE id = 'fld_sys_office_expenses';
