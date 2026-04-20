-- Add isSystem flag and slug for stable structural folder references
ALTER TABLE "folders"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "slug"     TEXT;

CREATE UNIQUE INDEX "folders_domain_slug_key" ON "folders"("domain", "slug");
CREATE INDEX "folders_isSystem_idx" ON "folders"("isSystem");

-- Seed four structural finance folders with stable ids and slugs
INSERT INTO "folders" (id, domain, name, "parentId", "sortOrder", "isSystem", slug, "createdAt", "updatedAt") VALUES
  ('fld_sys_company_expenses', 'FINANCE', 'Постійні витрати', NULL, 0, true, 'company-expenses',  NOW(), NOW()),
  ('fld_sys_office_expenses',  'FINANCE', 'Витрати офісу',    NULL, 1, true, 'office-expenses',   NOW(), NOW()),
  ('fld_sys_office_fixed',     'FINANCE', 'Постійні', 'fld_sys_office_expenses', 0, true, 'office-fixed',    NOW(), NOW()),
  ('fld_sys_office_variable',  'FINANCE', 'Змінні',   'fld_sys_office_expenses', 1, true, 'office-variable', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Reassign legacy finance entries (no project, no folder) to the company-expenses block
UPDATE "finance_entries"
SET "folderId" = 'fld_sys_company_expenses'
WHERE "projectId" IS NULL AND "folderId" IS NULL;
