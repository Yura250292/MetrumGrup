/**
 * Перетворити проект "Тіфані" з 1-Project-14-Stages схеми на
 * Folder + 14-окремих-Projects.
 *
 * Стара структура:
 *   Project "Тіфані" (telegramChatId=...)
 *     └─ ProjectStageRecord "Квартира 192" (telegramThreadId=...)
 *          └─ ProjectStageRecord "Малярні роботи" (parentStageId=192)
 *               └─ FinanceEntry × N (stageRecordId=Малярка, projectId=Тіфані)
 *
 * Нова структура:
 *   Folder "Тіфані"
 *     └─ Project "Квартира 192" (telegramChatId=..., telegramThreadId=..., folderId=Тіфані)
 *          └─ ProjectStageRecord "Малярні роботи" (parentStageId=null, projectId=Кв192)
 *               └─ FinanceEntry × N (projectId=Кв192)
 *
 * Скрипт ідемпотентний: повторний запуск пропускає вже мігровані квартири.
 *
 * Usage:  npx tsx scripts/migrate-tiffani-to-projects.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";

const OLD_PROJECT_SLUG = "tiffani";
const FOLDER_NAME = "Тіфані";
const NEW_SLUG_PREFIX = "tiffani-";

interface Args {
  dryRun: boolean;
}
function parseArgs(): Args {
  return { dryRun: process.argv.slice(2).includes("--dry-run") };
}

async function main() {
  const args = parseArgs();
  if (args.dryRun) console.log("🧪 DRY RUN — нічого не запишеться у БД");

  const oldProject = await prisma.project.findUnique({
    where: { slug: OLD_PROJECT_SLUG },
    select: { id: true, title: true, firmId: true, telegramChatId: true },
  });
  if (!oldProject) {
    console.log("✓ Старого проекту вже немає — нема що мігрувати");
    return;
  }
  console.log(`Старий проект: ${oldProject.title} (chatId=${oldProject.telegramChatId})`);

  // 1. Folder
  let folder = await prisma.folder.findFirst({
    where: { domain: "PROJECT", name: FOLDER_NAME, firmId: oldProject.firmId },
    select: { id: true },
  });
  if (!folder) {
    if (args.dryRun) {
      console.log(`  + [dry] Створив би Folder PROJECT "${FOLDER_NAME}"`);
      folder = { id: "[dry-folder-id]" };
    } else {
      folder = await prisma.folder.create({
        data: {
          domain: "PROJECT",
          name: FOLDER_NAME,
          firmId: oldProject.firmId,
          isSystem: false,
        },
        select: { id: true },
      });
      console.log(`  ✓ Створено Folder "${FOLDER_NAME}" (${folder.id})`);
    }
  } else {
    console.log(`  = Folder вже існує (${folder.id})`);
  }

  // 2. Iterate apartment-stages
  const apartmentStages = await prisma.projectStageRecord.findMany({
    where: { projectId: oldProject.id, parentStageId: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      customName: true,
      sortOrder: true,
      telegramThreadId: true,
      allocatedBudget: true,
    },
  });

  let migratedCount = 0;
  let skippedCount = 0;

  for (const apt of apartmentStages) {
    const name = apt.customName ?? `(stage ${apt.id})`;
    const numMatch = name.match(/\b(\d{1,4})\b/);
    if (!numMatch) {
      console.log(`  ↷ "${name}" — без номера, пропускаю (можеш видалити вручну)`);
      continue;
    }
    const num = numMatch[1];
    const newSlug = `${NEW_SLUG_PREFIX}${num}`;

    const existing = await prisma.project.findUnique({ where: { slug: newSlug }, select: { id: true } });
    if (existing) {
      console.log(`  = "${name}" → ${newSlug} вже існує (${existing.id}), пропускаю`);
      skippedCount++;
      continue;
    }

    console.log(`\n▶ Мігрую "${name}" → Project ${newSlug}`);

    // 2a. Create new Project
    const newProjectData = {
      title: name,
      slug: newSlug,
      status: "ACTIVE" as const,
      firmId: oldProject.firmId,
      folderId: folder.id,
      clientName: oldProject.title, // Тіфані — клієнт-будівля
      telegramChatId: oldProject.telegramChatId,
      telegramThreadId: apt.telegramThreadId,
      ...(apt.allocatedBudget && { totalBudget: apt.allocatedBudget }),
    };

    if (args.dryRun) {
      const onParent = await prisma.financeEntry.count({ where: { stageRecordId: apt.id, projectId: oldProject.id } });
      const subStages = await prisma.projectStageRecord.findMany({
        where: { parentStageId: apt.id },
        select: { id: true, customName: true },
      });
      const subStageIds = subStages.map((s) => s.id);
      const onSubs = subStageIds.length === 0 ? 0 : await prisma.financeEntry.count({ where: { stageRecordId: { in: subStageIds } } });
      console.log(`  [dry] Створив би Project "${name}" з ${subStages.length} категоріями робіт, перепривʼязав ${onParent + onSubs} entries`);
      migratedCount++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: newProjectData,
        select: { id: true },
      });

      // 2b. Children stage records (work categories) — change projectId, drop parentStageId
      const subStages = await tx.projectStageRecord.findMany({
        where: { parentStageId: apt.id },
        select: { id: true, customName: true },
      });

      const subStageIds = subStages.map((s) => s.id);
      let reattachedSubs = 0;
      if (subStageIds.length > 0) {
        const r = await tx.projectStageRecord.updateMany({
          where: { id: { in: subStageIds } },
          data: { projectId: newProject.id, parentStageId: null },
        });
        reattachedSubs = r.count;
      }

      // 2c. FinanceEntry on the apartment-stage itself OR on its substages →
      //     reassign projectId to new project (stageRecordId stays the same).
      const allRelevantStageIds = [apt.id, ...subStageIds];
      const reattachedEntries = await tx.financeEntry.updateMany({
        where: { stageRecordId: { in: allRelevantStageIds } },
        data: { projectId: newProject.id },
      });

      // 2d. Move entries that were on the apartment-stage (without a category yet)
      //     to be on the project root (stageRecordId = null) so they don't dangle on
      //     a stage that's about to be deleted.
      await tx.financeEntry.updateMany({
        where: { stageRecordId: apt.id, projectId: newProject.id },
        data: { stageRecordId: null },
      });

      // 2e. Delete the apartment-stage itself (its substages now belong to newProject root)
      await tx.projectStageRecord.delete({ where: { id: apt.id } });

      console.log(`  ✓ Project "${name}" (${newProject.id}): ${reattachedSubs} категорій робіт, ${reattachedEntries.count} entries`);
    }, { timeout: 60000 });

    migratedCount++;
  }

  // 3. Cleanup old project: only if all apartment-stages are gone or skipped.
  const remainingStages = await prisma.projectStageRecord.count({ where: { projectId: oldProject.id } });
  if (remainingStages === 0) {
    if (!args.dryRun) {
      await prisma.project.delete({ where: { id: oldProject.id } });
      console.log(`\n✓ Видалено старий Project "${oldProject.title}"`);
    } else {
      console.log(`\n[dry] Видалив би старий Project "${oldProject.title}"`);
    }
  } else {
    console.log(`\n⚠ У старого проекту ще ${remainingStages} стейджів — не видаляю`);
  }

  console.log(`\n──────\nГотово. Мігровано: ${migratedCount}, пропущено (вже були): ${skippedCount}`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
