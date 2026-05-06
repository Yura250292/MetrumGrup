/**
 * Звіт План vs Факт по 12 квартирах Тіфані. Без UI-фільтрів — повна історія.
 *
 * Виводить:
 *   - Plan Income (USD-кошторис конвертований у UAH)
 *   - Plan Expense (план з кошторису "Зведені цифри")
 *   - Fact Expense (наш імпорт з TG, без archived)
 *   - План маржа = Plan Income - Plan Expense
 *   - Виконання = Fact / Plan × 100%
 *   - Реальна маржа = Plan Income - Fact Expense
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

function fmt(n: number, w = 14): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 }).padStart(w);
}
function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`.padStart(5);
}

async function main() {
  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  console.log(`\n${"Квартира".padEnd(15)} | ${"Plan Income".padStart(14)} | ${"Plan Expense".padStart(14)} | ${"Fact Expense".padStart(14)} | ${"Викон.".padStart(6)} | ${"Plan Marg.".padStart(14)} | ${"Real Marg.".padStart(14)}`);
  console.log("-".repeat(110));

  let totalPI = 0, totalPE = 0, totalFE = 0;
  const sorted = [...projects].sort((a, b) => {
    const na = Number(a.title.match(/\d+/)?.[0] ?? 0);
    const nb = Number(b.title.match(/\d+/)?.[0] ?? 0);
    return na - nb;
  });

  for (const p of sorted) {
    const planIncome = await prisma.financeEntry.aggregate({
      where: { projectId: p.id, kind: "PLAN", type: "INCOME", isArchived: false, description: { contains: "[plan-income-seed]" } },
      _sum: { amount: true },
    });
    const planExpense = await prisma.financeEntry.aggregate({
      where: {
        projectId: p.id,
        kind: "PLAN",
        type: "EXPENSE",
        isArchived: false,
        OR: [
          { description: { contains: "[plan-detail]" } },
          { description: { contains: "[plan-expense-budget]" } },
        ],
      },
      _sum: { amount: true },
    });
    const factExpense = await prisma.financeEntry.aggregate({
      where: { projectId: p.id, kind: "FACT", type: "EXPENSE", isArchived: false },
      _sum: { amount: true },
    });

    const pi = Number(planIncome._sum.amount ?? 0);
    const pe = Number(planExpense._sum.amount ?? 0);
    const fe = Number(factExpense._sum.amount ?? 0);
    totalPI += pi; totalPE += pe; totalFE += fe;

    const completion = pe > 0 ? fe / pe : 0;
    const planMargin = pi - pe;
    const realMargin = pi - fe;

    console.log(
      `${p.title.padEnd(15)} | ${fmt(pi)} | ${fmt(pe)} | ${fmt(fe)} | ${pct(completion)} | ${fmt(planMargin)} | ${fmt(realMargin)}`,
    );
  }

  console.log("-".repeat(110));
  console.log(
    `${"Σ".padEnd(15)} | ${fmt(totalPI)} | ${fmt(totalPE)} | ${fmt(totalFE)} | ${pct(totalFE / totalPE)} | ${fmt(totalPI - totalPE)} | ${fmt(totalPI - totalFE)}`,
  );
  console.log(`\nplан виконано: ${(totalFE / totalPE * 100).toFixed(1)}% (${fmt(totalFE, 0)} / ${fmt(totalPE, 0)} ₴)`);
  console.log(`📊 Очікувана маржа за планом: ${fmt(totalPI - totalPE, 0)} ₴`);
  console.log(`💰 Реальна маржа на сьогодні: ${fmt(totalPI - totalFE, 0)} ₴ (якщо дороблять — наблизиться до плану)\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
