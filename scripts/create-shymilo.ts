/**
 * Створює (або оновлює) користувача shymilo93@gmail.com з:
 *  - base role = HR, home firmId = metrum-group
 *  - UserFirmAccess[metrum-studio] = SUPER_ADMIN (адмін на Studio)
 *
 * Ідемпотентний: повторні запуски просто синхронізують стан.
 *
 * Запуск: `npx tsx scripts/create-shymilo.ts`
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "shymilo93@gmail.com";
  const plainPassword = "Qwerty1993";
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // Гарантуємо існування обох фірм (idempotent — без знищення даних).
  await prisma.firm.upsert({
    where: { id: "metrum-group" },
    create: {
      id: "metrum-group",
      slug: "metrum-group",
      name: "Metrum Group",
      isDefault: true,
    },
    update: {},
  });
  await prisma.firm.upsert({
    where: { id: "metrum-studio" },
    create: {
      id: "metrum-studio",
      slug: "metrum-studio",
      name: "Metrum Studio",
      isDefault: false,
    },
    update: {},
  });
  console.log("✅ Фірми metrum-group, metrum-studio готові");

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      password: passwordHash,
      name: "Shymilo Admin",
      role: "HR", // base role = HR (на home фірмі Metrum Group)
      firmId: "metrum-group",
      isActive: true,
    },
    update: {
      // На повторному запуску не перезаписуємо ім'я/active, але оновлюємо пароль і home firm.
      password: passwordHash,
      role: "HR",
      firmId: "metrum-group",
      isActive: true,
    },
  });

  await prisma.userFirmAccess.upsert({
    where: { userId_firmId: { userId: user.id, firmId: "metrum-studio" } },
    create: {
      userId: user.id,
      firmId: "metrum-studio",
      role: "SUPER_ADMIN", // на Studio — адмін
    },
    update: {
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ Користувач shymilo93@gmail.com готовий:");
  console.log(`   - email:   ${user.email}`);
  console.log(`   - role:    HR (на Metrum Group)`);
  console.log(`   - access:  SUPER_ADMIN (на Metrum Studio)`);
  console.log(`   - login:   ${plainPassword}`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
