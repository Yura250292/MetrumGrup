import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Колонка зветься "firmId" (camelCase, без @map). Перевіряємо backfill.
  const usersStats = await prisma.$queryRaw<{ total: bigint; null_count: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "firmId" IS NULL) AS null_count FROM users`;
  const projStats = await prisma.$queryRaw<{ total: bigint; null_count: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "firmId" IS NULL) AS null_count FROM projects`;
  const finStats = await prisma.$queryRaw<{ total: bigint; null_count: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "firmId" IS NULL) AS null_count FROM finance_entries`;

  console.log(`USERS:   total=${usersStats[0].total}, firmId IS NULL = ${usersStats[0].null_count}`);
  console.log(`PROJECTS: total=${projStats[0].total}, firmId IS NULL = ${projStats[0].null_count}`);
  console.log(`FINANCE: total=${finStats[0].total}, firmId IS NULL = ${finStats[0].null_count}`);
}

main().finally(() => prisma.$disconnect());
