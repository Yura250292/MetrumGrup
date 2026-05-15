-- AlterTable
-- Підзаголовок бригади (тип робіт, напр. «Монолітні роботи»).
-- IF NOT EXISTS — колонку вже синхронізовано через `prisma db push`.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "description" TEXT;
