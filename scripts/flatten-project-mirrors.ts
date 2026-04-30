/**
 * Прибирає проміжний контейнер "Проєкти" (slug=mirrored-projects) у FINANCE
 * дереві: всі mirror-папки проектів (без PROJECT-папки в проектному дереві)
 * піднімаються на root рівень фінансування. Тоді дерево фінансування стає
 * пласким — без дублювання з sidebar "Проекти".
 *
 * Якщо проект знаходиться у PROJECT-папці (folderId set) — його mirror лишається
 * вкладеним у дзеркало тієї PROJECT-папки.
 *
 * Виконується по кожній фірмі окремо. Ідемпотентний.
 *
 * Запуск: npx tsx scripts/flatten-project-mirrors.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Знаходимо всі "mirrored-projects" корені (по одному на фірму).
  const roots = await prisma.folder.findMany({
    where: { domain: "FINANCE", slug: "mirrored-projects" },
    select: { id: true, firmId: true },
  });

  if (roots.length === 0) {
    console.log("✅ Контейнерів 'mirrored-projects' уже нема. Нічого робити.");
    return;
  }

  let liftedTotal = 0;
  let deletedRoots = 0;

  for (const root of roots) {
    // ВСІ дочірні папки контейнера піднімаємо на root рівень — незалежно від
    // того mirroredFromProjectId це чи mirroredFromId. Користувач хоче пласку
    // структуру (контейнер дублював sidebar "Проекти").
    const lifted = await prisma.folder.updateMany({
      where: { parentId: root.id, domain: "FINANCE" },
      data: { parentId: null },
    });
    liftedTotal += lifted.count;

    const remaining = await prisma.folder.count({ where: { parentId: root.id } });
    if (remaining === 0) {
      await prisma.folder.delete({ where: { id: root.id } });
      deletedRoots++;
    }

    console.log(
      `firmId=${root.firmId ?? "null"}: підняв ${lifted.count}, root ${remaining === 0 ? "видалено" : "лишився"}`,
    );
  }

  console.log(`\n✅ Усього: піднято ${liftedTotal} папок, видалено ${deletedRoots} контейнерів.`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
