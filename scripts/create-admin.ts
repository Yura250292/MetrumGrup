import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🔐 Створення адміністратора для продакшну\n");

  // ЗМІНІТЬ ЦІ ДАНІ!
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "change-me-please";
  const name = process.env.ADMIN_NAME || "Адміністратор";
  const phone = process.env.ADMIN_PHONE || "+380000000000";

  // Перевірка чи існує користувач
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log("⚠️  Користувач з таким email вже існує!");
    console.log(`Email: ${email}`);
    console.log("\nЯкщо хочете створити нового адміна, змініть email.");
    process.exit(0);
  }

  // Хешування пароля
  const passwordHash = await bcrypt.hash(password, 10);

  // Створення адміна
  const admin = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name,
      phone,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("✅ Адміністратор успішно створено!\n");
  console.log("Дані для входу:");
  console.log(`Email: ${admin.email}`);
  console.log(`Password: ${password}`);
  console.log(`\n⚠️  ВАЖЛИВО: Змініть пароль після першого входу!\n`);
  console.log(`Логін: https://your-domain.com/login`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Помилка:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
