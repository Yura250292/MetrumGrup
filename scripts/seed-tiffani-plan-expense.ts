/**
 * Створює PLAN EXPENSE записи (плановий бюджет витрат) для кожної квартири
 * Тіфані за даними з кошторису "/План Тіфані/Зведені цифри.pdf".
 *
 * Тепер у /admin-v2/financing буде видно:
 *   - PLAN EXPENSE (план з кошторису, 14.24 млн)
 *   - FACT EXPENSE (наш імпорт чеків з TG, ~13.14 млн)
 *   - PLAN INCOME (виручка від замовника, 23.46 млн ₴)
 *   - Маржа план = PLAN INCOME - PLAN EXPENSE = ~9.22 млн ₴
 *
 * Idempotent: маркер "[plan-expense-budget]".
 *
 * Usage: npx tsx scripts/seed-tiffani-plan-expense.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const SEED_MARKER = "[plan-expense-budget]";

interface PlanRow {
  num: number;
  area: number;
  amount: number;
}

const PLAN: PlanRow[] = [
  { num: 49, area: 38.3, amount: 1_993_825 },
  { num: 52, area: 65.1, amount: 2_863_045 },
  { num: 54, area: 43.9, amount: 1_912_839 },
  { num: 154, area: 37.1, amount: 764_917.4 },
  { num: 159, area: 37.1, amount: 817_235.6 },
  { num: 160, area: 68.7, amount: 1_111_059 },
  { num: 164, area: 37.0, amount: 793_141.3 },
  { num: 192, area: 63.7, amount: 1_042_511 },
  { num: 197, area: 64.2, amount: 1_076_585 },
  { num: 201, area: 65.4, amount: 628_535.9 },
  { num: 204, area: 65.6, amount: 624_042.8 },
  { num: 205, area: 68.7, amount: 608_766.8 },
];

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error(`Folder "${FOLDER_NAME}" не знайдено`);

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true, financeFolderMirror: { select: { id: true } } },
  });
  const byNum = new Map<number, typeof projects[number]>();
  for (const p of projects) {
    const m = p.title.match(/(\d+)/);
    if (m) byNum.set(Number(m[1]), p);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error("SUPER_ADMIN не знайдено");

  console.log(dryRun ? "🧪 DRY RUN\n" : "🚀 Створюю PLAN EXPENSE\n");

  let created = 0;
  let skipped = 0;
  let total = 0;

  for (const row of PLAN) {
    const project = byNum.get(row.num);
    if (!project) {
      console.log(`  ❌ Кв ${row.num}: проект не знайдено`);
      continue;
    }

    const existing = await prisma.financeEntry.findFirst({
      where: {
        projectId: project.id,
        kind: "PLAN",
        type: "EXPENSE",
        description: { contains: SEED_MARKER },
      },
      select: { id: true, amount: true },
    });
    if (existing) {
      console.log(`  ↷ Кв ${row.num.toString().padStart(3)}: вже є PLAN EXPENSE (${fmt(Number(existing.amount))} ₴)`);
      skipped++;
      continue;
    }

    total += row.amount;
    if (dryRun) {
      console.log(`  + [dry] Кв ${row.num.toString().padStart(3)}: ${fmt(row.amount)} ₴ (${row.area} м²)`);
      continue;
    }

    await prisma.financeEntry.create({
      data: {
        type: "EXPENSE",
        kind: "PLAN",
        status: "APPROVED",
        amount: row.amount,
        currency: "UAH",
        occurredAt: new Date("2025-07-01"),
        approvedAt: new Date(),
        approvedById: admin.id,
        projectId: project.id,
        firmId: FIRM_ID,
        folderId: project.financeFolderMirror?.id ?? null,
        category: "construction",
        title: `Плановий бюджет витрат (кошторис)`,
        description: `${SEED_MARKER} ${row.area} м², за зведеною таблицею кошторису`,
        createdById: admin.id,
        source: "MANUAL",
      },
    });
    console.log(`  ✓ Кв ${row.num.toString().padStart(3)}: ${fmt(row.amount)} ₴`);
    created++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Створено: ${created}, пропущено: ${skipped}`);
  console.log(`Σ план витрат: ${fmt(total)} ₴`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
