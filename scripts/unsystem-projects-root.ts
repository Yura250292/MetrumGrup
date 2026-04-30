/**
 * Знімає isSystem з FINANCE-папки "Проєкти" (slug=mirrored-projects). Раніше
 * вона була системною — у UI малювалася з колодкою. Тепер це звичайний
 * організаційний контейнер; колодка лишається тільки на "Загальні витрати"
 * та її піддереві.
 *
 * Ідемпотентний.
 *
 * Запуск: npx tsx scripts/unsystem-projects-root.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.folder.updateMany({
    where: {
      domain: "FINANCE",
      slug: "mirrored-projects",
      isSystem: true,
    },
    data: { isSystem: false },
  });

  console.log(`✅ Оновлено: ${updated.count} папок "mirrored-projects" → isSystem=false`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
