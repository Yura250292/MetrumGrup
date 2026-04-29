/**
 * Backfill firmId на Folder.
 *
 * Логіка присвоєння:
 *  - mirroredFromProjectId є → беремо firmId з проекту (FINANCE-mirror папки
 *    Studio-проектів отримають Studio firm).
 *  - PROJECT/ESTIMATE/MEETING domain з дочірніми проектами/кошторисами/нарадами
 *    → беремо firmId з першої дитини (всі мають той самий firmId).
 *  - Інше → 'metrum-group' (default firm).
 *
 * Ідемпотентний: оновлюємо лише ті, де firmId IS NULL.
 *
 * Запуск: npx tsx scripts/backfill-folder-firm.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Сирі рядки беремо через raw — потрібно для UPDATE з різними firmId.
  const all = await prisma.folder.findMany({
    where: { firmId: null },
    select: {
      id: true,
      domain: true,
      mirroredFromProjectId: true,
    },
  });

  console.log(`Знайшов ${all.length} папок без firmId.`);
  if (all.length === 0) return;

  let mirrorMatched = 0;
  let projectMatched = 0;
  let estimateMatched = 0;
  let meetingMatched = 0;
  let defaulted = 0;

  for (const folder of all) {
    let firmId: string | null = null;

    if (folder.mirroredFromProjectId) {
      const proj = await prisma.project.findUnique({
        where: { id: folder.mirroredFromProjectId },
        select: { firmId: true },
      });
      firmId = proj?.firmId ?? null;
      if (firmId) mirrorMatched++;
    }

    if (!firmId && folder.domain === "PROJECT") {
      const child = await prisma.project.findFirst({
        where: { folderId: folder.id },
        select: { firmId: true },
      });
      firmId = child?.firmId ?? null;
      if (firmId) projectMatched++;
    }

    if (!firmId && folder.domain === "ESTIMATE") {
      const child = await prisma.estimate.findFirst({
        where: { folderId: folder.id },
        select: { project: { select: { firmId: true } } },
      });
      firmId = child?.project?.firmId ?? null;
      if (firmId) estimateMatched++;
    }

    if (!firmId && folder.domain === "MEETING") {
      const child = await prisma.meeting.findFirst({
        where: { folderId: folder.id },
        select: { project: { select: { firmId: true } } },
      });
      firmId = child?.project?.firmId ?? null;
      if (firmId) meetingMatched++;
    }

    if (!firmId) {
      firmId = "metrum-group";
      defaulted++;
    }

    await prisma.folder.update({
      where: { id: folder.id },
      data: { firmId },
    });
  }

  console.log("✅ Backfill complete:");
  console.log(`  - mirror match:   ${mirrorMatched}`);
  console.log(`  - PROJECT match:  ${projectMatched}`);
  console.log(`  - ESTIMATE match: ${estimateMatched}`);
  console.log(`  - MEETING match:  ${meetingMatched}`);
  console.log(`  - default 'metrum-group': ${defaulted}`);

  const remaining = await prisma.folder.count({ where: { firmId: null } });
  console.log(`Папок з firmId IS NULL: ${remaining} (має бути 0)`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
