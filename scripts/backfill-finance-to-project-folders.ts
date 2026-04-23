/**
 * Одноразовий backfill: для кожної FINANCE-папки під системною "Проєкти", яка
 * ще не має mirroredFromId — створити PROJECT-папку і звʼязати. Ідемпотентно.
 */
import { backfillFinanceToProjectFolders } from "../src/lib/folders/mirror-service";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await backfillFinanceToProjectFolders();
  console.log("Reverse folder backfill done:", result);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
