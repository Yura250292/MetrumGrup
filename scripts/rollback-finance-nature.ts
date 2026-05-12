/**
 * Safe Finance Migration — rollback Phase 3 backfill.
 *
 * Reads rollback marker (logs/backfill-finance-nature-rollback-*.json)
 * і виставляє financeNature=null для всіх записів, які backfill оновив.
 *
 * Idempotent: безпечно перезапускати. Записи, які тимчасом вручну
 * оновили на інше значення — не чіпає (фільтр WHERE id IN AND
 * financeNature = rule.nature).
 *
 * Usage:
 *   npx tsx scripts/rollback-finance-nature.ts logs/backfill-finance-nature-rollback-2026-05-12T...json
 *   npx tsx scripts/rollback-finance-nature.ts <path> --apply
 *
 * Default — dry-run. Без --apply нічого не пише.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";

const prisma = new PrismaClient();

type Marker = {
  capturedAt: string;
  mode: string;
  totalUpdated: number;
  results: Array<{
    ruleId: string;
    candidates: number;
    updated: number;
    updatedIds: string[];
  }>;
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const markerPath = args.find((a) => !a.startsWith("--"));
  if (!markerPath) {
    console.error("usage: rollback-finance-nature.ts <marker.json> [--apply]");
    process.exit(2);
  }
  if (!fs.existsSync(markerPath)) {
    console.error(`marker not found: ${markerPath}`);
    process.exit(2);
  }
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as Marker;
  console.log(
    `🧯 Rollback Phase 3 backfill\n   marker: ${markerPath}\n   captured: ${marker.capturedAt}\n   mode: ${apply ? "APPLY ⚠️" : "dry-run"}\n`,
  );

  let total = 0;
  for (const r of marker.results) {
    if (r.updatedIds.length === 0) continue;
    console.log(`📋 ${r.ruleId}: ${r.updatedIds.length} IDs to revert`);
    if (!apply) {
      total += r.updatedIds.length;
      continue;
    }
    // Reset тільки тих, що зараз ще мають "наше" значення — інакше можемо
    // зачепити ручні правки. Точна відповідність ruleId → nature з backfill.
    const nature = inferNatureFromRuleId(r.ruleId);
    const res = await prisma.financeEntry.updateMany({
      where: { id: { in: r.updatedIds }, financeNature: nature },
      data: { financeNature: null },
    });
    console.log(`   reverted ${res.count} (skipped ${r.updatedIds.length - res.count} — manually changed)`);
    total += res.count;
  }
  console.log(`\nTotal reverted: ${total}`);
}

function inferNatureFromRuleId(
  ruleId: string,
):
  | "BUDGET_INCOME"
  | "BUDGET_EXPENSE"
  | "COMMITTED_INCOME"
  | "COMMITTED_EXPENSE"
  | "ACTUAL_INCOME"
  | "ACTUAL_EXPENSE" {
  if (ruleId === "A.estimate_auto_expense") return "BUDGET_EXPENSE";
  if (ruleId === "A.estimate_auto_income") return "BUDGET_INCOME";
  if (ruleId === "B.kb2_signed") return "COMMITTED_INCOME";
  if (ruleId === "C.invoice_paid") return "ACTUAL_EXPENSE";
  if (ruleId === "C.invoice_unpaid") return "COMMITTED_EXPENSE";
  if (ruleId === "D.foreman_report") return "COMMITTED_EXPENSE";
  if (ruleId === "E.stage_auto_plan_expense") return "BUDGET_EXPENSE";
  if (ruleId === "E.stage_auto_plan_income") return "BUDGET_INCOME";
  if (ruleId === "F.client_payment_received") return "ACTUAL_INCOME";
  throw new Error(`unknown ruleId: ${ruleId}`);
}

main()
  .catch((err) => {
    console.error("❌ Rollback failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
