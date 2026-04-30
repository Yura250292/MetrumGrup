/**
 * Read-only: викликає computeSummary з реальним where-фільтром для
 * фірм Studio і Group, щоб переконатись що фікс прибрав 1.2M і 12M.
 */
import { PrismaClient } from "@prisma/client";
import { computeSummary } from "../src/lib/financing/queries";

const prisma = new PrismaClient();

async function check(label: string, firmId: string) {
  const summary = await computeSummary({
    isArchived: false,
    firmId,
  });
  console.log(
    `\n[${label}] (firmId=${firmId})\n` +
      `  PLAN income:  ${summary.plan.income.sum.toLocaleString("uk-UA")} ₴ (${summary.plan.income.count})\n` +
      `  PLAN expense: ${summary.plan.expense.sum.toLocaleString("uk-UA")} ₴ (${summary.plan.expense.count})\n` +
      `  PLAN balance: ${(summary.plan.income.sum - summary.plan.expense.sum).toLocaleString("uk-UA")} ₴\n` +
      `  FACT income:  ${summary.fact.income.sum.toLocaleString("uk-UA")} ₴ (${summary.fact.income.count})\n` +
      `  FACT expense: ${summary.fact.expense.sum.toLocaleString("uk-UA")} ₴ (${summary.fact.expense.count})\n` +
      `  FACT balance: ${(summary.fact.income.sum - summary.fact.expense.sum).toLocaleString("uk-UA")} ₴`,
  );
}

async function main() {
  await check("Metrum Studio", "metrum-studio");
  await check("Metrum Group", "metrum-group");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
