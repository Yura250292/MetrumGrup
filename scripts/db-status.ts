import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Перевірка стану бази даних\n");

  try {
    // Перевірка підключення
    await prisma.$connect();
    console.log("✅ Підключення до БД успішне");

    // Перевірка версії PostgreSQL
    const result = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT version();
    `;
    console.log(`📊 PostgreSQL: ${result[0].version.split(" ")[1]}`);

    // Статистика по таблицях
    console.log("\n📈 Статистика:");

    const users = await prisma.user.count();
    console.log(`  👥 Користувачів: ${users}`);

    const admins = await prisma.user.count({
      where: { role: { in: ["SUPER_ADMIN", "MANAGER"] } },
    });
    console.log(`  🔑 Адміністраторів: ${admins}`);

    const clients = await prisma.user.count({
      where: { role: "CLIENT" },
    });
    console.log(`  👤 Клієнтів: ${clients}`);

    const projects = await prisma.project.count();
    console.log(`  🏗️  Проектів: ${projects}`);

    const activeProjects = await prisma.project.count({
      where: { status: "ACTIVE" },
    });
    console.log(`  ▶️  Активних проектів: ${activeProjects}`);

    const estimates = await prisma.estimate.count();
    console.log(`  📝 Кошторисів: ${estimates}`);

    const materials = await prisma.material.count();
    console.log(`  🧱 Матеріалів у базі: ${materials}`);

    // Перевірка міграцій
    console.log("\n🔧 Статус таблиць:");
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;
    console.log(`  📊 Всього таблиць: ${tables.length}`);

    console.log("\n✅ База даних в робочому стані!\n");
  } catch (error) {
    console.error("\n❌ Помилка підключення до БД:");
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
