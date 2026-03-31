/**
 * Скрипт для додавання ролі FINANCIER користувачу
 *
 * Використання:
 * npx tsx scripts/add-financier-role.ts email@example.com
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Помилка: Вкажіть email користувача");
    console.log("Використання: npx tsx scripts/add-financier-role.ts email@example.com");
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      console.error(`❌ Користувача з email ${email} не знайдено`);
      process.exit(1);
    }

    console.log(`\n📋 Поточний користувач:`);
    console.log(`   Ім'я: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Роль: ${user.role}`);

    if (user.role === "FINANCIER") {
      console.log(`\n✅ Користувач вже має роль FINANCIER`);
      process.exit(0);
    }

    // Оновити роль
    const updated = await prisma.user.update({
      where: { email },
      data: { role: "FINANCIER" },
    });

    console.log(`\n✅ Роль успішно оновлено!`);
    console.log(`   Нова роль: ${updated.role}`);
    console.log(`\n🔐 Тепер користувач може:`);
    console.log(`   • Заходити на /admin/finance`);
    console.log(`   • Переглядати кошториси`);
    console.log(`   • Налаштовувати рентабельність, податки, логістику`);
    console.log(`   • Створювати та використовувати шаблони`);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
