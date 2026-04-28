/**
 * Backfill: присвоює всім існуючим User/Project/FinanceEntry без firmId
 * значення "metrum-group" (default firm). Ідемпотентний — оновлює лише ті, де NULL.
 *
 * Запуск (один раз після міграції): `npx tsx scripts/backfill-firm-id.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Гарантуємо що Metrum Group існує (на випадок порожньої БД).
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

  const u = await prisma.$executeRaw`
    UPDATE users SET "firmId" = 'metrum-group' WHERE "firmId" IS NULL`;
  const p = await prisma.$executeRaw`
    UPDATE projects SET "firmId" = 'metrum-group' WHERE "firmId" IS NULL`;
  const f = await prisma.$executeRaw`
    UPDATE finance_entries SET "firmId" = 'metrum-group' WHERE "firmId" IS NULL`;

  console.log(`✅ Backfill complete:`);
  console.log(`   - users updated: ${u}`);
  console.log(`   - projects updated: ${p}`);
  console.log(`   - finance_entries updated: ${f}`);

  // Підсумок після backfill — всі мають бути 0.
  const usersStats = await prisma.$queryRaw<{ null_count: bigint }[]>`
    SELECT COUNT(*) AS null_count FROM users WHERE "firmId" IS NULL`;
  const projStats = await prisma.$queryRaw<{ null_count: bigint }[]>`
    SELECT COUNT(*) AS null_count FROM projects WHERE "firmId" IS NULL`;
  const finStats = await prisma.$queryRaw<{ null_count: bigint }[]>`
    SELECT COUNT(*) AS null_count FROM finance_entries WHERE "firmId" IS NULL`;

  console.log(`\nVerification (мають бути 0):`);
  console.log(`   - users  with firmId NULL: ${usersStats[0].null_count}`);
  console.log(`   - projects with firmId NULL: ${projStats[0].null_count}`);
  console.log(`   - finance with firmId NULL: ${finStats[0].null_count}`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
