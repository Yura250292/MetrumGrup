/**
 * Backfill: для кожної PROJECT-папки створити FINANCE-mirror або зв'язати з
 * існуючою FINANCE-папкою тієї ж назви під кореневою "Проєкти".
 *
 * Ідемпотентний — можна запускати повторно.
 *
 * Запуск: npx tsx scripts/mirror-folders-backfill.ts
 */
import { backfillProjectMirrors } from "../src/lib/folders/mirror-service";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await backfillProjectMirrors();
  console.log("Folder mirror backfill done:", result);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
