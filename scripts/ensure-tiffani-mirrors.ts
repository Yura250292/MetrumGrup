/**
 * Створює відсутні FINANCE mirror-папки для проектів Тіфані + перепривʼязує
 * 3283 FinanceEntry на свої mirror-папки. Після цього у "Фінансуванні" у Studio
 * буде видно Folder "Тіфані" з 12 підпапок-квартир, у кожній — справжні
 * витрати з імпорту.
 */
import { prisma } from "../src/lib/prisma";
import { ensureProjectMirror } from "../src/lib/folders/mirror-service";

async function main() {
  const folder = await prisma.folder.findFirst({
    where: { name: "Тіфані", firmId: "metrum-studio", domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("PROJECT folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  console.log(`Знайшов ${projects.length} проектів-квартир`);

  for (const p of projects) {
    const mirrorId = await ensureProjectMirror(p.id);
    // Перепривʼяжемо всі FinanceEntry цього проекту в його mirror-папку.
    const moved = await prisma.financeEntry.updateMany({
      where: { projectId: p.id, folderId: { not: mirrorId } },
      data: { folderId: mirrorId },
    });
    console.log(`  ✓ ${p.title} → mirror=${mirrorId}, перепривʼязано ${moved.count} entries`);
  }
  console.log("\nГотово. Перевір /admin-v2/financing у Studio — побачиш Folder Тіфані з 12 квартирами.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
