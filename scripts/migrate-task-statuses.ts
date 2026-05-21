/**
 * Одноразова data-міграція: 4 англійських статуси задач → 3 українські.
 *
 *   Backlog      → Новий
 *   In Progress  → В роботі
 *   In Review    → В роботі  (зливаємо)
 *   Done         → Закрито
 *
 * Запускати:
 *   # dry-run (default) — нічого не пише, лише рахує
 *   npx tsx scripts/migrate-task-statuses.ts
 *
 *   # реально перевести
 *   npx tsx scripts/migrate-task-statuses.ts --apply
 *
 * Idempotent: повторний прогін на вже мігрованих проєктах буде no-op.
 *
 * BEFORE RUNNING:
 *   - Зробити снапшот БД (Railway → Backup).
 *   - Прогнати з dry-run і переглянути counts.
 *
 * Для кожного проєкту:
 *   1. Upsert 3 нові статуси (Новий/В роботі/Закрито) за патерном
 *      seedProjectTaskDefaults — `(projectId, name)` має unique constraint.
 *   2. Перевести Task.statusId зі старих → нових.
 *   3. Видалити старі статуси, які залишились без задач.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_STATUSES = [
  { name: "Новий", color: "#94a3b8", position: 0, isDone: false, isDefault: true },
  { name: "В роботі", color: "#3b82f6", position: 1, isDone: false, isDefault: false },
  { name: "Закрито", color: "#10b981", position: 2, isDone: true, isDefault: false },
];

const OLD_TO_NEW: Record<string, string> = {
  "Backlog": "Новий",
  "In Progress": "В роботі",
  "In Review": "В роботі",
  "Done": "Закрито",
};

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "🚀 APPLY mode: записи будуть змінені у БД."
      : "🧪 DRY-RUN mode: нічого не зміниться. Додайте --apply щоб записати.",
  );

  const projects = await prisma.project.findMany({ select: { id: true, title: true } });
  console.log(`📦 Проєктів: ${projects.length}`);

  let totalNewStatusesCreated = 0;
  let totalTasksReassigned = 0;
  let totalOldStatusesDeleted = 0;
  const skippedProjects: string[] = [];

  for (const project of projects) {
    // 1) знайти що зараз є по дефолтних англ. назвах
    const oldStatuses = await prisma.taskStatus.findMany({
      where: {
        projectId: project.id,
        name: { in: Object.keys(OLD_TO_NEW) },
      },
    });
    if (oldStatuses.length === 0) {
      skippedProjects.push(project.title);
      continue;
    }

    // 2) upsert 3 нові — потрібні їх id для UPDATE tasks
    const newStatusIds = new Map<string, string>();
    for (const ns of NEW_STATUSES) {
      const existing = await prisma.taskStatus.findFirst({
        where: { projectId: project.id, name: ns.name },
      });
      if (existing) {
        newStatusIds.set(ns.name, existing.id);
      } else if (apply) {
        const created = await prisma.taskStatus.create({
          data: {
            projectId: project.id,
            name: ns.name,
            color: ns.color,
            position: ns.position,
            isDone: ns.isDone,
            isDefault: ns.isDefault,
          },
        });
        newStatusIds.set(ns.name, created.id);
        totalNewStatusesCreated++;
      } else {
        newStatusIds.set(ns.name, `<NEW:${ns.name}>`);
        totalNewStatusesCreated++;
      }
    }

    // 3) перевести задачі
    for (const old of oldStatuses) {
      const targetName = OLD_TO_NEW[old.name];
      if (!targetName) continue;
      const newId = newStatusIds.get(targetName);
      if (!newId) continue;

      const count = await prisma.task.count({
        where: { projectId: project.id, statusId: old.id },
      });
      if (count === 0) continue;

      console.log(
        `  [${project.title}] ${count} задач: «${old.name}» → «${targetName}»`,
      );
      if (apply) {
        await prisma.task.updateMany({
          where: { projectId: project.id, statusId: old.id },
          data: { statusId: newId },
        });
      }
      totalTasksReassigned += count;
    }

    // 4) видалити старі (тепер вони порожні)
    for (const old of oldStatuses) {
      const stillHasTasks = await prisma.task.count({
        where: { statusId: old.id },
      });
      if (stillHasTasks > 0) continue;
      if (apply) {
        await prisma.taskStatus.delete({ where: { id: old.id } });
      }
      totalOldStatusesDeleted++;
    }
  }

  console.log("\n📊 Підсумок:");
  console.log(`  Нових статусів створено: ${totalNewStatusesCreated}`);
  console.log(`  Задач переведено: ${totalTasksReassigned}`);
  console.log(`  Старих статусів видалено: ${totalOldStatusesDeleted}`);
  console.log(`  Пропущено проєктів (немає старих статусів): ${skippedProjects.length}`);
  if (!apply) {
    console.log("\n💡 Це був dry-run. Запустіть з --apply щоб реально перенести.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
