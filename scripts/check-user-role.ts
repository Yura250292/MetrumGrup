/**
 * Скрипт для перевірки ролі користувача
 *
 * Використання:
 * npx tsx scripts/check-user-role.ts email@example.com
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Помилка: Вкажіть email користувача");
    console.log("Використання: npx tsx scripts/check-user-role.ts email@example.com");
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      console.error(`❌ Користувача з email ${email} не знайдено`);
      process.exit(1);
    }

    console.log(`\n👤 Інформація про користувача:`);
    console.log(`   Ім'я: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Роль: ${user.role}`);
    console.log(`   Активний: ${user.isActive ? "Так" : "Ні"}`);
    console.log(`   Створено: ${new Date(user.createdAt).toLocaleDateString("uk-UA")}`);

    console.log(`\n📋 Статус ролі FINANCIER:`);
    if (user.role === "FINANCIER") {
      console.log(`   ✅ Користувач вже має роль FINANCIER`);
      console.log(`   ✅ Може заходити на /admin/finance`);
    } else {
      console.log(`   ⚠️  Поточна роль: ${user.role}`);
      console.log(`   ⚠️  Потрібно оновити на FINANCIER`);
      console.log(`\n   Для оновлення виконайте:`);
      console.log(`   npx tsx scripts/add-financier-role.ts ${email}`);
    }
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
