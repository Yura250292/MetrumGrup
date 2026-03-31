/**
 * Скрипт для встановлення статусу кошториса в FINANCE_REVIEW
 *
 * Використання:
 * npx tsx scripts/set-estimate-for-finance.ts EST-0001
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const number = process.argv[2];

  if (!number) {
    console.error("❌ Помилка: Вкажіть номер кошториса");
    console.log("Використання: npx tsx scripts/set-estimate-for-finance.ts EST-0001");
    console.log("\nАбо без параметрів щоб встановити статус для останнього кошториса:");
    console.log("npx tsx scripts/set-estimate-for-finance.ts");
    process.exit(1);
  }

  try {
    let estimate;

    if (number === "latest") {
      // Взяти останній кошторис
      estimate = await prisma.estimate.findFirst({
        orderBy: { createdAt: "desc" },
        include: { project: { select: { title: true } } },
      });
    } else {
      estimate = await prisma.estimate.findUnique({
        where: { number },
        include: { project: { select: { title: true } } },
      });
    }

    if (!estimate) {
      console.error(`❌ Кошторис ${number} не знайдено`);
      process.exit(1);
    }

    console.log(`\n📋 Кошторис:`);
    console.log(`   Номер: ${estimate.number}`);
    console.log(`   Назва: ${estimate.title}`);
    console.log(`   Проєкт: ${estimate.project?.title}`);
    console.log(`   Поточний статус: ${estimate.status}`);

    if (estimate.status === "FINANCE_REVIEW") {
      console.log(`\n✅ Кошторис вже має статус FINANCE_REVIEW`);
      process.exit(0);
    }

    // Оновити статус
    const updated = await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: "FINANCE_REVIEW" },
    });

    console.log(`\n✅ Статус успішно оновлено!`);
    console.log(`   Новий статус: ${updated.status}`);
    console.log(`\n💼 Тепер цей кошторис:`);
    console.log(`   • Видимий фінансисту на /admin/finance`);
    console.log(`   • Готовий до налаштування фінансових параметрів`);
    console.log(`   • URL: /admin/finance/configure/${estimate.id}`);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
