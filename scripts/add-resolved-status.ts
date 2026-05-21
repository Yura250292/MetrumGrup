/**
 * Одноразова data-міграція: додає статус «Вирішено» (review-state) у кожен
 * проєкт, що його ще немає. Position=2, isDone=false, color=#f59e0b.
 *
 * Запуск:
 *   npx tsx scripts/add-resolved-status.ts          # dry-run
 *   npx tsx scripts/add-resolved-status.ts --apply  # реально записати
 *
 * Idempotent: повторно — no-op (skipDuplicates через unique (projectId, name)).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "🚀 APPLY" : "🧪 DRY-RUN");

  const projects = await prisma.project.findMany({ select: { id: true, title: true } });
  let created = 0;
  let shifted = 0;

  for (const p of projects) {
    const existing = await prisma.taskStatus.findFirst({
      where: { projectId: p.id, name: "Вирішено" },
    });
    if (existing) continue;

    // Зрушуємо «Закрито» на position=3 (якщо було 2)
    const closed = await prisma.taskStatus.findFirst({
      where: { projectId: p.id, name: "Закрито" },
    });
    if (apply) {
      if (closed && closed.position < 3) {
        await prisma.taskStatus.update({
          where: { id: closed.id },
          data: { position: 3 },
        });
        shifted++;
      }
      await prisma.taskStatus.create({
        data: {
          projectId: p.id,
          name: "Вирішено",
          color: "#f59e0b",
          position: 2,
          isDone: false,
          isDefault: false,
        },
      });
      created++;
    } else {
      console.log(`  [${p.title}] додав би «Вирішено»`);
      created++;
    }
  }

  console.log(`\nСтворено: ${created}, зрушено «Закрито»: ${shifted}`);
  if (!apply) console.log("💡 Запустіть з --apply щоб реально зберегти.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
