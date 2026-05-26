#!/usr/bin/env node
/**
 * Зачистка демо-даних, що з'явилися після інциденту 2026-05-22 (npm run db:seed).
 *
 * Видаляє:
 *  - 3 demo проєкти за назвами (Будинок на Липовій 15, Ремонт квартири на
 *    Хрещатику, Котедж у Буче) разом з cascade-children (photoReports, acts,
 *    payments, tasks, etc.)
 *  - 5 demo users (admin@metrum.group, manager@metrum.group, client@*.com,
 *    studio@metrum.dev) + foreman.studio@metrum.local
 *
 * НЕ ВИДАЛЯЄ:
 *  - 47 contractors (real, з xlsx)
 *  - 105 FinanceEntry (real, з xlsx) — навіть тих, що належали demo-проєктам
 *    (просто відвʼязує projectId, щоб запис не загубився)
 *  - 223 employees + 108 payroll periods (real, з 1С)
 *  - 37 cost codes (довідник)
 *  - Real admin users: ufedishin@gmail.com, stetskiy
 *  - System projects ("Особисті задачі", "Розробка сайту", "Реклама",
 *    "Маркетинг", "Продажі", "HR та команда", "Адміністрація" — internal/dept)
 *
 * Використання:
 *   node scripts/cleanup-demo-data.mjs              # DRY RUN (default)
 *   node scripts/cleanup-demo-data.mjs --confirm    # реальне видалення
 *
 * SAFETY: відмовляється запускатись якщо DATABASE_URL не localhost.
 */

import { PrismaClient } from "@prisma/client";

const LOCAL_URL = "postgresql://admin@localhost:5432/metrum_local";
const url = process.env.DATABASE_URL ?? LOCAL_URL;

const ALLOW_PROD = process.argv.includes("--allow-prod");
const CONFIRM = process.argv.includes("--confirm");
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

if (!isLocal && !ALLOW_PROD) {
  console.error("❌ REFUSE: DATABASE_URL не вказує на localhost.");
  console.error("   Це виглядає як production DB.");
  console.error("   url =", url.replace(/:[^:@]+@/, ":****@"));
  console.error("");
  console.error("Якщо це справді задумано — додай --allow-prod:");
  console.error("   DATABASE_URL=<PROD> node scripts/cleanup-demo-data.mjs --allow-prod --confirm");
  console.error("ВАЖЛИВО: зроби бекап ПЕРЕД цим (див. DEPLOY_2026-05-26.md Stage 0).");
  process.exit(1);
}
const p = new PrismaClient({ datasources: { db: { url } } });

const DEMO_PROJECT_TITLES = [
  "Будинок на Липовій, 15",
  "Ремонт квартири на Хрещатику",
  "Котедж у Буче",
];

const DEMO_USER_EMAILS = [
  "admin@metrum.group",
  "manager@metrum.group",
  "client@example.com",
  "client2@example.com",
  "studio@metrum.dev",
  "foreman.studio@metrum.local",
];

console.log("=".repeat(72));
console.log(CONFIRM ? "🗑️  REAL CLEANUP" : "🔍 DRY RUN");
console.log("DB:", url.replace(/:[^:@]+@/, ":****@"));
console.log("=".repeat(72));

// ── 1. Знаходимо demo projects ─────────────────────────────────────────────
const demoProjects = await p.project.findMany({
  where: { title: { in: DEMO_PROJECT_TITLES } },
  select: {
    id: true,
    title: true,
    _count: {
      select: {
        photoReports: true,
        completionActs: true,
        payments: true,
        tasks: true,
        estimates: true,
        files: true,
        stages: true,
        foremanReports: true,
      },
    },
  },
});

console.log("\n📦 DEMO PROJECTS to delete:", demoProjects.length);
for (const pr of demoProjects) {
  console.log(`  • ${pr.title}`);
  console.log(`      tasks: ${pr._count.tasks}, photoReports: ${pr._count.photoReports}, acts: ${pr._count.completionActs}`);
  console.log(`      payments: ${pr._count.payments}, estimates: ${pr._count.estimates}, files: ${pr._count.files}`);
  console.log(`      stages: ${pr._count.stages}, foremanReports: ${pr._count.foremanReports}`);
}

const demoProjectIds = demoProjects.map((x) => x.id);

// ── 2. Знаходимо demo users ────────────────────────────────────────────────
const demoUsers = await p.user.findMany({
  where: { email: { in: DEMO_USER_EMAILS } },
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    employeeProfile: { select: { id: true, fullName: true } },
  },
});

console.log("\n👤 DEMO USERS to delete:", demoUsers.length);
for (const u of demoUsers) {
  const empInfo = u.employeeProfile
    ? ` [linked Employee: ${u.employeeProfile.fullName}]`
    : "";
  console.log(`  • ${u.email} (${u.role}) — ${u.name}${empInfo}`);
}

const demoUserIds = demoUsers.map((x) => x.id);

// ── 3. Що ЗБЕРЕЖЕНО ────────────────────────────────────────────────────────
const realUsers = await p.user.findMany({
  where: { email: { notIn: DEMO_USER_EMAILS } },
  select: { id: true, email: true, name: true, role: true },
});
const realProjects = await p.project.findMany({
  where: { title: { notIn: DEMO_PROJECT_TITLES } },
  select: { id: true, title: true },
});

console.log("\n✅ PRESERVED:");
console.log(`  Users (${realUsers.length}):`);
realUsers.forEach((u) => console.log(`    • ${u.email ?? "(no email)"} — ${u.role}`));
console.log(`  Projects (${realProjects.length}):`);
realProjects.forEach((pr) => console.log(`    • ${pr.title}`));

const cpCount = await p.counterparty.count();
const feCount = await p.financeEntry.count();
const empCount = await p.employee.count();
const ccCount = await p.costCode.count();
console.log(`  Counterparties: ${cpCount}`);
console.log(`  FinanceEntry: ${feCount}`);
console.log(`  Employee: ${empCount}`);
console.log(`  CostCode: ${ccCount}`);

// ── 4. Виконати або не виконати ────────────────────────────────────────────
if (!CONFIRM) {
  console.log("\n" + "=".repeat(72));
  console.log("🔍 DRY RUN — нічого не видалено.");
  console.log("Щоб видалити насправді:  node scripts/cleanup-demo-data.mjs --confirm");
  console.log("=".repeat(72));
  await p.$disconnect();
  process.exit(0);
}

console.log("\n" + "=".repeat(72));
console.log("🗑️  Видаляю...");
console.log("=".repeat(72));

const result = await p.$transaction(async (tx) => {
  const stats = {};

  // 1. Відвʼязати FinanceEntry від demo projects (НЕ видаляємо самі entries —
  //    дані можуть бути цінними для архіву).
  if (demoProjectIds.length > 0) {
    const unlinked = await tx.financeEntry.updateMany({
      where: { projectId: { in: demoProjectIds } },
      data: { projectId: null },
    });
    stats.financeEntriesUnlinked = unlinked.count;
  }

  // 2. Видалити demo projects (cascade видалить tasks, photoReports, acts,
  //    payments, estimates, files, members, stageRecords тощо — згідно
  //    Prisma onDelete: Cascade).
  if (demoProjectIds.length > 0) {
    const del = await tx.project.deleteMany({
      where: { id: { in: demoProjectIds } },
    });
    stats.projectsDeleted = del.count;
  }

  // 3. Demo users — НЕ ВИДАЛЯЄМО (FK на Meeting/Chat/AuditLog тощо), а
  //    деактивуємо + перейменовуємо. Так вони:
  //      - зникають з усіх pickers (фільтр isActive у UI),
  //      - не можуть залогінитись,
  //      - не зʼявляються у списках,
  //    але зберігається історія (хто створив якусь нараду тощо).
  if (demoUserIds.length > 0) {
    const empUnlinked = await tx.employee.updateMany({
      where: { userId: { in: demoUserIds } },
      data: { userId: null },
    });
    stats.employeesUnlinked = empUnlinked.count;

    let renamedCount = 0;
    for (const u of demoUsers) {
      await tx.user.update({
        where: { id: u.id },
        data: {
          isActive: false,
          name: `(seed) ${u.name}`,
          // email лишаємо — потрібен для login-блокування через isActive
        },
      });
      renamedCount += 1;
    }
    stats.usersDeactivatedRenamed = renamedCount;
  }

  return stats;
});

console.log("\n📊 Stats:");
for (const [k, v] of Object.entries(result)) {
  console.log(`  ${k}: ${v}`);
}

console.log("\n✅ Готово. Перевір: http://localhost:3000/admin-v2/feed");
await p.$disconnect();
