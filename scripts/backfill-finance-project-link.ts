/**
 * Узгоджує FinanceEntry.projectId з папками: якщо запис лежить у mirror-папці
 * проекту (або у її піддереві) і projectId=NULL, ставимо projectId=
 * mirror.mirroredFromProjectId. Те саме для firmId — якщо NULL, беремо з проекту.
 *
 * Розв'язує розбіжність "Дохід у проекті" (4.4М) vs "Дохід у папці" (16.9М),
 * коли частина записів мала folderId, але projectId=NULL.
 *
 * Ідемпотентний — оновлює лише ті, де projectId IS NULL.
 *
 * Запуск: npx tsx scripts/backfill-finance-project-link.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Усі mirror-папки проектів.
  const mirrors = await prisma.folder.findMany({
    where: { domain: "FINANCE", mirroredFromProjectId: { not: null } },
    select: {
      id: true,
      mirroredFromProjectId: true,
      mirroredFromProject: { select: { id: true, title: true, firmId: true } },
    },
  });

  if (mirrors.length === 0) {
    console.log("Немає mirror-папок проектів. Нічого робити.");
    return;
  }

  // 2) Для recursion descendants — тягнемо всі FINANCE папки з parent.
  const allFolders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    if (f.parentId) {
      const arr = childrenMap.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenMap.set(f.parentId, arr);
    }
  }
  function descendants(rootId: string): string[] {
    const out: string[] = [rootId];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const kids = childrenMap.get(id);
      if (kids) {
        out.push(...kids);
        stack.push(...kids);
      }
    }
    return out;
  }

  let totalUpdated = 0;
  for (const mirror of mirrors) {
    const project = mirror.mirroredFromProject;
    if (!project) continue;
    const folderIds = descendants(mirror.id);

    // Stamp projectId на entries що мають folderId з нашого піддерева і
    // projectId IS NULL.
    const r1 = await prisma.financeEntry.updateMany({
      where: {
        folderId: { in: folderIds },
        projectId: null,
      },
      data: { projectId: project.id },
    });
    // Stamp firmId на entries що мають folderId з нашого піддерева і firmId IS NULL.
    if (project.firmId) {
      await prisma.financeEntry.updateMany({
        where: {
          folderId: { in: folderIds },
          firmId: null,
        },
        data: { firmId: project.firmId },
      });
    }

    if (r1.count > 0) {
      console.log(
        `📎 ${project.title}: stamp projectId на ${r1.count} записах (з ${folderIds.length} папок)`,
      );
    }
    totalUpdated += r1.count;
  }

  console.log(`\n✅ Усього оновлено: ${totalUpdated} FinanceEntry.`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
