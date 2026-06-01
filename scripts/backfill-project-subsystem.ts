/**
 * Backfill для project-subsystem alignment (P13).
 *
 * Idempotent. БЕЗПЕКА: за замовчуванням DRY-RUN (тільки рахує). Щоб реально
 * писати — запусти з CONFIRM=1. Скрипт ДРУКУЄ цільову БД перед роботою.
 *
 * Локально (throwaway):
 *   DATABASE_URL=postgresql://admin@localhost:5432/metrum_local CONFIRM=1 \
 *     npx tsx scripts/backfill-project-subsystem.ts
 *
 * НЕ чіпає історичні FinanceEntry.
 *
 * Що робить:
 *   1. Project.actualStartDate = startDate для ACTIVE/COMPLETED, де ще null.
 *   2. EstimateItem.unitCost = unitPrice, де unitCost null.
 *   3. EstimateItem.unitPriceCustomer = priceWithMargin||unitPrice, де null.
 *   4. EstimateItem.isReportable = false для itemType='material'.
 *      (sourceType=ORIGINAL — це schema default, окремо не чіпаємо.)
 */
import { prisma } from "@/lib/prisma";
import type { ProjectStatus } from "@prisma/client";

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "(unset)";
  const host = dbUrl.replace(/\/\/[^@]*@/, "//***@");
  const confirm = process.env.CONFIRM === "1";
  console.log(`[backfill] target DB: ${host}`);
  console.log(`[backfill] mode: ${confirm ? "WRITE (CONFIRM=1)" : "DRY-RUN"}`);

  // 1. actualStartDate
  const projWhere = {
    actualStartDate: null,
    startDate: { not: null },
    status: { in: ["ACTIVE", "COMPLETED"] as ProjectStatus[] },
  };
  const projCount = await prisma.project.count({ where: projWhere });
  console.log(`[1] Project.actualStartDate ← startDate: ${projCount}`);
  if (confirm && projCount > 0) {
    const projects = await prisma.project.findMany({
      where: projWhere,
      select: { id: true, startDate: true },
    });
    for (const p of projects) {
      await prisma.project.update({
        where: { id: p.id },
        data: { actualStartDate: p.startDate },
      });
    }
  }

  // 2. unitCost ← unitPrice
  const costCount = await prisma.estimateItem.count({ where: { unitCost: null } });
  console.log(`[2] EstimateItem.unitCost ← unitPrice: ${costCount}`);
  if (confirm && costCount > 0) {
    const items = await prisma.estimateItem.findMany({
      where: { unitCost: null },
      select: { id: true, unitPrice: true },
    });
    for (const it of items) {
      await prisma.estimateItem.update({
        where: { id: it.id },
        data: { unitCost: it.unitPrice },
      });
    }
  }

  // 3. unitPriceCustomer ← priceWithMargin||unitPrice
  const custCount = await prisma.estimateItem.count({ where: { unitPriceCustomer: null } });
  console.log(`[3] EstimateItem.unitPriceCustomer ← priceWithMargin||unitPrice: ${custCount}`);
  if (confirm && custCount > 0) {
    const items = await prisma.estimateItem.findMany({
      where: { unitPriceCustomer: null },
      select: { id: true, unitPrice: true, priceWithMargin: true },
    });
    for (const it of items) {
      const pwm = Number(it.priceWithMargin ?? 0);
      await prisma.estimateItem.update({
        where: { id: it.id },
        data: { unitPriceCustomer: pwm > 0 ? it.priceWithMargin : it.unitPrice },
      });
    }
  }

  // 4. isReportable=false для матеріалів
  const matCount = await prisma.estimateItem.count({
    where: { itemType: "material", isReportable: true },
  });
  console.log(`[4] EstimateItem.isReportable=false для material: ${matCount}`);
  if (confirm && matCount > 0) {
    await prisma.estimateItem.updateMany({
      where: { itemType: "material", isReportable: true },
      data: { isReportable: false },
    });
  }

  console.log(`[backfill] done${confirm ? "" : " (dry-run — нічого не записано)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
