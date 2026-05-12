/**
 * Safe Finance Migration — Phase 3 backfill.
 *
 * Заповнює FinanceEntry.financeNature для існуючих рядків за детермінованими
 * правилами з SAFE_FINANCE_MIGRATION_PLAN.md.
 *
 * BEFORE RUNNING:
 *   1. Зробити снапшот PostgreSQL (Railway → Backup).
 *   2. Відкрити /admin-v2/financing/migration-audit, зберегти baseline JSON.
 *   3. Запустити з --dry-run і прискіпливо переглянути counts.
 *   4. Тільки потім — `--apply`.
 *
 * Usage:
 *   # dry-run (default) — нічого не пише, лише рахує
 *   npx tsx scripts/backfill-finance-nature.ts
 *
 *   # apply на дев / staging копії продакшну
 *   npx tsx scripts/backfill-finance-nature.ts --apply
 *
 *   # обмежити batch size (default 500)
 *   npx tsx scripts/backfill-finance-nature.ts --apply --batch=200
 *
 * Idempotency: кожне правило фільтрує WHERE financeNature IS NULL.
 * Re-run безпечний — нічого не перепише.
 *
 * Rules:
 *   A. ESTIMATE_AUTO PLAN EXPENSE        → BUDGET_EXPENSE
 *   A. ESTIMATE_AUTO PLAN INCOME         → BUDGET_INCOME
 *   B. PLAN INCOME MANUAL category="client_advance" (KB2 proxy)
 *                                        → COMMITTED_INCOME
 *   C. FACT EXPENSE MANUAL invoiceNumber!=null, status=PAID
 *                                        → ACTUAL_EXPENSE
 *   C. FACT EXPENSE MANUAL invoiceNumber!=null, status in [APPROVED, PENDING]
 *                                        → COMMITTED_EXPENSE
 *   D. FOREMAN_REPORT FACT EXPENSE       → COMMITTED_EXPENSE
 *   E. STAGE_AUTO PLAN EXPENSE           → BUDGET_EXPENSE
 *   E. STAGE_AUTO PLAN INCOME            → BUDGET_INCOME
 *
 * NB: STAGE_AUTO FACT і ESTIMATE_AUTO STANDALONE-aggregate-income явно
 * НЕ класифікуються (лишаються null) — це progress (не cash) і ambiguous
 * за role-визначенням. Phase 5 writers вже класифікують нові записи.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

const prisma = new PrismaClient();

type FinanceNatureValue =
  | "BUDGET_INCOME"
  | "BUDGET_EXPENSE"
  | "COMMITTED_INCOME"
  | "COMMITTED_EXPENSE"
  | "ACTUAL_INCOME"
  | "ACTUAL_EXPENSE";

type Rule = {
  id: string;
  label: string;
  nature: FinanceNatureValue;
  where: Prisma.FinanceEntryWhereInput;
};

const RULES: Rule[] = [
  {
    id: "A.estimate_auto_expense",
    label: "ESTIMATE_AUTO PLAN EXPENSE → BUDGET_EXPENSE",
    nature: "BUDGET_EXPENSE",
    where: {
      source: "ESTIMATE_AUTO",
      kind: "PLAN",
      type: "EXPENSE",
      financeNature: null,
    },
  },
  {
    id: "A.estimate_auto_income",
    label: "ESTIMATE_AUTO PLAN INCOME → BUDGET_INCOME",
    nature: "BUDGET_INCOME",
    where: {
      source: "ESTIMATE_AUTO",
      kind: "PLAN",
      type: "INCOME",
      financeNature: null,
    },
  },
  {
    id: "B.kb2_signed",
    label: "PLAN INCOME MANUAL client_advance → COMMITTED_INCOME",
    nature: "COMMITTED_INCOME",
    where: {
      source: "MANUAL",
      kind: "PLAN",
      type: "INCOME",
      category: "client_advance",
      financeNature: null,
    },
  },
  {
    id: "F.client_payment_received",
    label: "MANUAL FACT INCOME (всі категорії крім client_advance) → ACTUAL_INCOME",
    nature: "ACTUAL_INCOME",
    where: {
      source: "MANUAL",
      kind: "FACT",
      type: "INCOME",
      financeNature: null,
    },
  },
  {
    id: "G.receipt_scan_derived",
    label: "MANUAL FACT EXPENSE з ReceiptScan (накладна/чек) → COMMITTED_EXPENSE",
    nature: "COMMITTED_EXPENSE",
    where: {
      source: "MANUAL",
      kind: "FACT",
      type: "EXPENSE",
      receiptScan: { isNot: null },
      financeNature: null,
    },
  },
  {
    id: "C.invoice_paid",
    label: "MANUAL FACT EXPENSE invoice + PAID → ACTUAL_EXPENSE",
    nature: "ACTUAL_EXPENSE",
    where: {
      source: "MANUAL",
      kind: "FACT",
      type: "EXPENSE",
      invoiceNumber: { not: null },
      status: "PAID",
      financeNature: null,
    },
  },
  {
    id: "C.invoice_unpaid",
    label: "MANUAL FACT EXPENSE invoice + (APPROVED|PENDING) → COMMITTED_EXPENSE",
    nature: "COMMITTED_EXPENSE",
    where: {
      source: "MANUAL",
      kind: "FACT",
      type: "EXPENSE",
      invoiceNumber: { not: null },
      status: { in: ["APPROVED", "PENDING"] },
      financeNature: null,
    },
  },
  {
    id: "D.foreman_report",
    label: "FOREMAN_REPORT FACT EXPENSE → COMMITTED_EXPENSE",
    nature: "COMMITTED_EXPENSE",
    where: {
      source: "FOREMAN_REPORT",
      kind: "FACT",
      type: "EXPENSE",
      financeNature: null,
    },
  },
  {
    id: "E.stage_auto_plan_expense",
    label: "STAGE_AUTO PLAN EXPENSE → BUDGET_EXPENSE",
    nature: "BUDGET_EXPENSE",
    where: {
      source: "STAGE_AUTO",
      kind: "PLAN",
      type: "EXPENSE",
      financeNature: null,
    },
  },
  {
    id: "E.stage_auto_plan_income",
    label: "STAGE_AUTO PLAN INCOME → BUDGET_INCOME",
    nature: "BUDGET_INCOME",
    where: {
      source: "STAGE_AUTO",
      kind: "PLAN",
      type: "INCOME",
      financeNature: null,
    },
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
    batch:
      Number(args.find((a) => a.startsWith("--batch="))?.split("=")[1]) || 500,
  };
}

type RuleResult = {
  ruleId: string;
  candidates: number;
  updated: number;
  /** Rollback marker — ID списки оновлених записів, по batch. */
  updatedIds: string[];
};

async function processRule(
  rule: Rule,
  opts: { apply: boolean; batch: number },
): Promise<RuleResult> {
  const candidateCount = await prisma.financeEntry.count({ where: rule.where });
  console.log(
    `\n📋 ${rule.id} · ${rule.label}\n   candidates: ${candidateCount}`,
  );
  if (candidateCount === 0) {
    return { ruleId: rule.id, candidates: 0, updated: 0, updatedIds: [] };
  }

  if (!opts.apply) {
    return {
      ruleId: rule.id,
      candidates: candidateCount,
      updated: 0,
      updatedIds: [],
    };
  }

  let totalUpdated = 0;
  const updatedIds: string[] = [];
  while (true) {
    // Беремо batch ID, оновлюємо, повторюємо. updateMany() обмеження по
    // ID-set гарантує що не зачепимо нові записи, що зайдуть під час бекфіл.
    const batchIds = await prisma.financeEntry.findMany({
      where: rule.where,
      select: { id: true },
      take: opts.batch,
    });
    if (batchIds.length === 0) break;

    const ids = batchIds.map((r) => r.id);
    const res = await prisma.financeEntry.updateMany({
      where: { id: { in: ids } },
      data: { financeNature: rule.nature },
    });
    totalUpdated += res.count;
    updatedIds.push(...ids);
    console.log(
      `   batch ${batchIds.length} → updated ${res.count} (running ${totalUpdated})`,
    );
  }
  return {
    ruleId: rule.id,
    candidates: candidateCount,
    updated: totalUpdated,
    updatedIds,
  };
}

async function main() {
  const opts = parseArgs();
  console.log(
    `🚀 Safe Finance Migration — Phase 3 backfill`
      + `\n   mode: ${opts.apply ? "APPLY ⚠️" : "dry-run (read-only)"}`
      + `\n   batch size: ${opts.batch}\n`,
  );

  const startNull = await prisma.financeEntry.count({
    where: { financeNature: null },
  });
  const totalEntries = await prisma.financeEntry.count();
  console.log(
    `Baseline before: ${startNull} / ${totalEntries} entries with financeNature=null`,
  );

  const results: RuleResult[] = [];
  for (const r of RULES) {
    results.push(await processRule(r, opts));
  }

  const endNull = await prisma.financeEntry.count({
    where: { financeNature: null },
  });
  const totalCandidates = results.reduce((s, r) => s + r.candidates, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

  console.log("\n=== SUMMARY ===");
  console.table(results);
  console.log(
    `\nNull before:    ${startNull}`
      + `\nNull after:     ${endNull}`
      + `\nCandidates:     ${totalCandidates}`
      + `\nUpdated:        ${totalUpdated}`
      + `\nMode:           ${opts.apply ? "APPLY" : "dry-run"}`,
  );

  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(
    logsDir,
    `backfill-finance-nature-${opts.apply ? "apply" : "dryrun"}-${stamp}.json`,
  );
  // Stripped log — agregати без ID для швидкого review.
  const summaryLog = {
    capturedAt: new Date().toISOString(),
    mode: opts.apply ? "apply" : "dry-run",
    batchSize: opts.batch,
    totalEntries,
    nullBefore: startNull,
    nullAfter: endNull,
    results: results.map((r) => ({
      ruleId: r.ruleId,
      candidates: r.candidates,
      updated: r.updated,
    })),
  };
  fs.writeFileSync(logPath, JSON.stringify(summaryLog, null, 2));
  console.log(`\n📝 Log saved: ${logPath}`);

  // Rollback marker — для apply режиму зберігаємо повний ID-list на кожне
  // правило. Якщо щось пішло не так:
  //   prisma.financeEntry.updateMany({
  //     where: { id: { in: marker.results[i].updatedIds } },
  //     data: { financeNature: null }
  //   });
  if (opts.apply) {
    const markerPath = path.join(
      logsDir,
      `backfill-finance-nature-rollback-${stamp}.json`,
    );
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          mode: "apply",
          totalUpdated,
          results,
        },
        null,
        2,
      ),
    );
    console.log(`🧯 Rollback marker saved: ${markerPath}`);
  }

  if (!opts.apply && totalCandidates > 0) {
    console.log(
      `\n🔵 Dry-run complete. Re-run with --apply to actually write.`,
    );
  }
}

main()
  .catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
