import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.FOREMAN_EMAIL || "foreman.test@metrum.local";
  const password = process.env.FOREMAN_PASSWORD || "Vykonrob2025!";
  const name = process.env.FOREMAN_NAME || "Тестовий Виконроб";
  const phone = process.env.FOREMAN_PHONE || "+380000000001";
  const firmId = process.env.FOREMAN_FIRM_ID || "metrum-group";

  console.log("🛠️  Створення тестового виконроба\n");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "FOREMAN") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "FOREMAN", isActive: true },
      });
      console.log(`⚠️  Існуючий user (${email}) — оновлено роль на FOREMAN.`);
    } else {
      console.log(`⚠️  Користувач з email ${email} уже існує і має роль FOREMAN.`);
    }
    console.log(`\n   ID: ${existing.id}`);
    console.log(`   Логін: ${email}`);
    console.log(`   (пароль НЕ змінено — використовуй той що задавали раніше)\n`);
    return;
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) {
    console.error(`❌ Фірму "${firmId}" не знайдено. Доступні:`);
    const firms = await prisma.firm.findMany({ select: { id: true, name: true } });
    firms.forEach((f) => console.error(`   - ${f.id} (${f.name})`));
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const foreman = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name,
      phone,
      role: "FOREMAN",
      firmId,
      isActive: true,
    },
  });

  console.log("✅ Виконроба створено!\n");
  console.log("─────────────────────────────");
  console.log(`  Логін:    ${foreman.email}`);
  console.log(`  Пароль:   ${password}`);
  console.log(`  Імʼя:     ${foreman.name}`);
  console.log(`  Телефон:  ${foreman.phone}`);
  console.log(`  Фірма:    ${firm.name} (${firm.id})`);
  console.log(`  ID:       ${foreman.id}`);
  console.log("─────────────────────────────\n");
  console.log("📌 Наступний крок: відкрий проект у /admin-v2/projects/[id] →");
  console.log("   таб «Команда» → додай цього user'а як FOREMAN на потрібні квартири.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Помилка:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
