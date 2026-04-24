-- Add dashboard layout per-user preferences
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboardLayoutJson" JSONB;
