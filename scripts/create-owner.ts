import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL || "owner@metrum.local";
  const password = process.env.OWNER_PASSWORD || "Director2025!";
  const name = process.env.OWNER_NAME || "Тестовий Власник";
  const phone = process.env.OWNER_PHONE || "+380000000003";

  console.log("👔 Створення тестового власника (OWNER)\n");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "OWNER") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "OWNER", isActive: true },
      });
      console.log(`⚠️  Користувач (${email}) існує — оновлено роль на OWNER.`);
    } else {
      console.log(`⚠️  Користувач з email ${email} вже існує і має роль OWNER.`);
    }
    console.log(`\n   ID: ${existing.id}`);
    console.log(`   Логін: ${email}`);
    console.log(`   (пароль НЕ змінено)\n`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const owner = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name,
      phone,
      role: "OWNER",
      // OWNER без firmId — бачить усі фірми (cross-firm view за замовчуванням)
      firmId: null,
      isActive: true,
    },
  });

  console.log("✅ Власника створено!\n");
  console.log("─────────────────────────────");
  console.log(`  Логін:    ${owner.email}`);
  console.log(`  Пароль:   ${password}`);
  console.log(`  Імʼя:     ${owner.name}`);
  console.log(`  ID:       ${owner.id}`);
  console.log("─────────────────────────────\n");
  console.log("📊 Запам'ятай: за замовчуванням бачить ОБИДВІ фірми (Group + Studio).");
  console.log("   У шапці лого = перемикач фірм (Group / Studio / Усі).\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Помилка:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
