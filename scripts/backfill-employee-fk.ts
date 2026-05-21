// Backfill для нових Employee-based FK у Department / Team / TeamMember.
// Запускається ОДИН раз після `db push` міграції 20260521_departments_teams_employee_fk.
// Безпечно повторювати: UPDATE на основі JOIN з employees — повторний запуск
// просто перезапише ті ж значення.

import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("→ Backfill Department.headEmployeeId з headUserId через employee.userId");
  const dep = await prisma.$executeRawUnsafe(`
    UPDATE "departments" d
    SET "headEmployeeId" = e.id
    FROM "employees" e
    WHERE d."headUserId" IS NOT NULL
      AND e."userId" = d."headUserId"
      AND d."headEmployeeId" IS NULL
  `);
  console.log(`  ✓ оновлено departments: ${dep}`);

  console.log("→ Backfill Team.leadEmployeeId з leadUserId через employee.userId");
  const tm = await prisma.$executeRawUnsafe(`
    UPDATE "teams" t
    SET "leadEmployeeId" = e.id
    FROM "employees" e
    WHERE t."leadUserId" IS NOT NULL
      AND e."userId" = t."leadUserId"
      AND t."leadEmployeeId" IS NULL
  `);
  console.log(`  ✓ оновлено teams: ${tm}`);

  console.log("→ Backfill TeamMember.employeeId з userId через employee.userId");
  const tmem = await prisma.$executeRawUnsafe(`
    UPDATE "team_members" tm
    SET "employeeId" = e.id
    FROM "employees" e
    WHERE tm."userId" IS NOT NULL
      AND e."userId" = tm."userId"
      AND tm."employeeId" IS NULL
  `);
  console.log(`  ✓ оновлено team_members: ${tmem}`);

  await prisma.$disconnect();
  console.log("Готово.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
