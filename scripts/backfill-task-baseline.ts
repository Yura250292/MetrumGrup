/**
 * Backfill Task.plannedStartAt / Task.plannedEndAt з існуючих startDate/dueDate.
 *
 * Idempotent — заповнює тільки коли planned* IS NULL і відповідний actual
 * (startDate/dueDate) IS NOT NULL. Запускати після `prisma migrate deploy`.
 *
 * Запуск: npx tsx scripts/backfill-task-baseline.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("[backfill-task-baseline] starting…");

  // plannedStartAt <- startDate
  const startRes = await prisma.task.updateMany({
    where: {
      plannedStartAt: null,
      startDate: { not: null },
    },
    data: {
      // Prisma updateMany не підтримує "встановити значення з іншого поля";
      // тому робимо це через raw SQL нижче для обох колонок одночасно.
    },
  });
  // Чорнетка вище потрібна для перевірки шляху Prisma — реально backfill робимо raw,
  // щоб уникнути N+1 (на 10к задачах це 10к запитів).
  void startRes;

  // ── Raw, idempotent (Postgres). Працює для Railway PG. ──
  // 1) plannedStartAt <- startDate
  const updated1 = await prisma.$executeRawUnsafe(
    `UPDATE tasks
     SET "plannedStartAt" = "startDate"
     WHERE "plannedStartAt" IS NULL
       AND "startDate" IS NOT NULL`,
  );

  // 2) plannedEndAt <- dueDate
  const updated2 = await prisma.$executeRawUnsafe(
    `UPDATE tasks
     SET "plannedEndAt" = "dueDate"
     WHERE "plannedEndAt" IS NULL
       AND "dueDate" IS NOT NULL`,
  );

  console.log(
    `[backfill-task-baseline] plannedStartAt updated: ${updated1} rows`,
  );
  console.log(`[backfill-task-baseline] plannedEndAt updated: ${updated2} rows`);
  console.log("[backfill-task-baseline] done.");
}

main()
  .catch((err) => {
    console.error("[backfill-task-baseline] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
