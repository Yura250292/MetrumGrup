/**
 * Read-only: знаходить проєкти, у яких PLAN:EXPENSE подвійно рахується
 * (одночасно існує PROJECT_BUDGET-запис і ESTIMATE_AUTO-записи).
 * Запуск: npx tsx scripts/inspect-double-budget.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const grouped = await prisma.financeEntry.groupBy({
    by: ["projectId", "source"],
    where: {
      kind: "PLAN",
      type: "EXPENSE",
      isArchived: false,
      projectId: { not: null },
      source: { in: ["PROJECT_BUDGET", "ESTIMATE_AUTO"] },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  type Row = { budgetSum: number; budgetRows: number; estimateSum: number; estimateRows: number };
  const byProject = new Map<string, Row>();
  for (const g of grouped) {
    if (!g.projectId) continue;
    const r = byProject.get(g.projectId) ?? {
      budgetSum: 0,
      budgetRows: 0,
      estimateSum: 0,
      estimateRows: 0,
    };
    const sum = Number(g._sum.amount ?? 0);
    if (g.source === "PROJECT_BUDGET") {
      r.budgetSum = sum;
      r.budgetRows = g._count._all;
    } else if (g.source === "ESTIMATE_AUTO") {
      r.estimateSum = sum;
      r.estimateRows = g._count._all;
    }
    byProject.set(g.projectId, r);
  }

  const affected = Array.from(byProject.entries()).filter(
    ([, r]) => r.budgetSum > 0 && r.estimateSum > 0,
  );

  if (affected.length === 0) {
    console.log("✅ Жодного проєкту з подвійним рахунком не знайдено.");
    return;
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: affected.map(([id]) => id) } },
    select: { id: true, title: true, firmId: true, totalBudget: true, isTestProject: true },
  });
  const projById = new Map(projects.map((p) => [p.id, p]));

  console.log(`⚠️  Знайдено ${affected.length} проєкт(ів) з подвійним PLAN:EXPENSE:\n`);
  const fmt = (n: number) =>
    new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);

  let totalInflation = 0;
  for (const [pid, r] of affected.sort((a, b) => b[1].budgetSum - a[1].budgetSum)) {
    const p = projById.get(pid);
    const firmTag = p?.firmId === "metrum-studio" ? "STUDIO" : "GROUP ";
    const testTag = p?.isTestProject ? " [TEST]" : "";
    const inflated = r.budgetSum + r.estimateSum;
    totalInflation += r.budgetSum;
    console.log(
      `[${firmTag}] ${p?.title ?? pid}${testTag}\n` +
        `   PROJECT_BUDGET: ${fmt(r.budgetSum)} ₴ (${r.budgetRows} запис)\n` +
        `   ESTIMATE_AUTO:  ${fmt(r.estimateSum)} ₴ (${r.estimateRows} рядк.)\n` +
        `   у summary бачимо: ${fmt(inflated)} ₴  → після фікса: ${fmt(r.estimateSum)} ₴\n`,
    );
  }
  console.log(`Загальна "інфляція" PLAN:EXPENSE по всіх проєктах: ${fmt(totalInflation)} ₴`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
