/**
 * One-shot: імпорт рахунків з xlsx (формат кошторисниці) у БД.
 * Логіка дублює /api/admin/financing/import-invoices/commit, але без HTTP-шару.
 *
 * Usage:
 *   npx tsx scripts/import-invoices-from-xlsx.ts <path-to-xlsx> [--commit]
 *
 * Без --commit виконує dry-run (виводить план, нічого не пише).
 */
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseInvoicesExcel } from "../src/lib/financing/invoice-import/parse-excel";
import {
  buildPlan,
  type CounterpartyCandidate,
  type FirmId,
} from "../src/lib/financing/invoice-import/build-plan";
import type { ProjectCandidate } from "../src/lib/financing/invoice-import/match-project";

const BOTH_FIRMS: FirmId[] = ["metrum-group", "metrum-studio"];

async function main() {
  const filePath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!filePath) {
    console.error("Usage: tsx scripts/import-invoices-from-xlsx.ts <xlsx> [--commit]");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  console.log(`📂 Reading ${filePath}…`);
  const buffer = readFileSync(filePath);
  const parsed = await parseInvoicesExcel(buffer);
  console.log(
    `   Parsed: ${parsed.rows.length} rows (skipped ${parsed.skippedRows} empty)`,
  );

  console.log("📥 Loading existing counterparties + projects from both firms…");
  const [cpGroup, cpStudio, projGroup, projStudio] = await Promise.all([
    prisma.counterparty.findMany({
      where: { firmId: "metrum-group", isActive: true },
      select: { id: true, name: true, firmId: true, edrpou: true, taxId: true },
    }),
    prisma.counterparty.findMany({
      where: { firmId: "metrum-studio", isActive: true },
      select: { id: true, name: true, firmId: true, edrpou: true, taxId: true },
    }),
    prisma.project.findMany({
      where: { firmId: "metrum-group" },
      select: { id: true, title: true, slug: true, address: true },
    }),
    prisma.project.findMany({
      where: { firmId: "metrum-studio" },
      select: { id: true, title: true, slug: true, address: true },
    }),
  ]);
  console.log(
    `   Existing: ${cpGroup.length} Group / ${cpStudio.length} Studio counterparties; ${projGroup.length} Group / ${projStudio.length} Studio projects`,
  );

  const plan = buildPlan({
    rows: parsed.rows,
    counterpartiesGroup: cpGroup as CounterpartyCandidate[],
    counterpartiesStudio: cpStudio as CounterpartyCandidate[],
    projectsByFirm: {
      group: projGroup as ProjectCandidate[],
      studio: projStudio as ProjectCandidate[],
    },
  });

  console.log("\n📊 Plan summary:");
  console.log(`   Total invoices: ${plan.totals.totalRows}`);
  console.log(
    `   PAID: ${plan.totals.paidCount} (${plan.totals.paidSum.toLocaleString("uk-UA")} ₴)`,
  );
  console.log(
    `   DEBT: ${plan.totals.debtCount} (${plan.totals.debtSum.toLocaleString("uk-UA")} ₴)`,
  );
  console.log(`   Supplier clusters: ${plan.clusters.length}`);
  console.log(`   New in Group: ${plan.totals.newCounterpartiesInGroup}`);
  console.log(`   New in Studio: ${plan.totals.newCounterpartiesInStudio}`);
  console.log(`   Matched to Project: ${plan.totals.matchedToProject}`);

  console.log("\n🏷  Top 10 clusters:");
  for (const c of plan.clusters.slice(0, 10)) {
    const g = c.groupMatch ? "✓G" : "+G";
    const s = c.studioMatch ? "✓S" : "+S";
    console.log(
      `   ${String(c.rowCount).padStart(3)} ${g} ${s} | ${c.displayName} (${c.totalAmount.toLocaleString("uk-UA")} ₴)`,
    );
  }

  if (!commit) {
    console.log("\n🟡 Dry-run only. Pass --commit to apply.");
    await prisma.$disconnect();
    return;
  }

  // Find a SUPER_ADMIN to attribute creation to.
  const author = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!author) {
    console.error("❌ No SUPER_ADMIN user found. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
  }
  const userId = author.id;
  console.log(
    `\n👤 Attributing creation to: ${author.name ?? author.email} (${userId})`,
  );

  console.log("\n🚀 Committing transaction…");
  const t0 = Date.now();

  const createdCounterpartyIds: Record<FirmId, string[]> = {
    "metrum-group": [],
    "metrum-studio": [],
  };
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  const errors: { rowNumber: number; error: string }[] = [];

  await prisma.$transaction(
    async (tx) => {
      const keyToFirmIds = new Map<string, Record<FirmId, string>>();

      for (const cluster of plan.clusters) {
        const ids: Record<FirmId, string> = {
          "metrum-group": "",
          "metrum-studio": "",
        };
        for (const firmId of BOTH_FIRMS) {
          const matched =
            firmId === "metrum-group" ? cluster.groupMatch : cluster.studioMatch;
          if (matched) {
            ids[firmId] = matched.id;
            continue;
          }
          const created = await tx.counterparty.create({
            data: {
              name: cluster.displayName,
              type: cluster.inferredType,
              roles: ["SUPPLIER"],
              isActive: true,
              firmId,
            },
            select: { id: true },
          });
          ids[firmId] = created.id;
          createdCounterpartyIds[firmId].push(created.id);
        }
        keyToFirmIds.set(cluster.normalizedKey, ids);
      }

      console.log(
        `   ✓ Counterparties: +${createdCounterpartyIds["metrum-group"].length} Group / +${createdCounterpartyIds["metrum-studio"].length} Studio`,
      );

      let i = 0;
      for (const inv of plan.invoices) {
        i++;
        if (i % 50 === 0) {
          console.log(`   …invoice ${i}/${plan.invoices.length}`);
        }
        if (inv.amount === null || inv.amount === undefined) {
          skipped.push({ rowNumber: inv.rowNumber, reason: "missing-amount" });
          continue;
        }
        const firmId: FirmId = inv.firmIdAssigned;
        const cluster = plan.clusters.find(
          (c) => c.normalizedKey === inv.supplierKey,
        );
        if (!cluster) {
          errors.push({ rowNumber: inv.rowNumber, error: "cluster not found" });
          continue;
        }
        const ids = keyToFirmIds.get(cluster.normalizedKey);
        if (!ids) {
          errors.push({ rowNumber: inv.rowNumber, error: "no ids" });
          continue;
        }
        const counterpartyId = ids[firmId];

        // Idempotency
        if (inv.invoiceNumber) {
          const existing = await tx.financeEntry.findFirst({
            where: {
              firmId,
              counterpartyId,
              invoiceNumber: inv.invoiceNumber,
            },
            select: { id: true },
          });
          if (existing) {
            skipped.push({
              rowNumber: inv.rowNumber,
              reason: `duplicate ${inv.invoiceNumber}`,
            });
            continue;
          }
        }

        const deliveryDate = inv.deliveryDate ? new Date(inv.deliveryDate) : null;
        const paymentDate = inv.paymentDate ? new Date(inv.paymentDate) : null;
        const occurredAt = deliveryDate ?? paymentDate ?? new Date();
        const supplierDisplay = cluster.displayName;

        const baseData: Prisma.FinanceEntryUncheckedCreateInput = {
          occurredAt,
          kind: "FACT",
          type: "EXPENSE",
          amount: new Prisma.Decimal(inv.amount),
          currency: "UAH",
          projectId: inv.matchedProjectId ?? null,
          category: "Постачальники",
          title: `${supplierDisplay} — рах. ${inv.invoiceNumber ?? "—"}`,
          description: inv.destination
            ? `Куди везли: ${inv.destination}`
            : null,
          counterparty: supplierDisplay,
          counterpartyId,
          invoiceNumber: inv.invoiceNumber,
          firmId,
          source: "MANUAL",
          createdById: userId,
          approvedAt: new Date(),
          approvedById: userId,
        };

        if (inv.isPaid) {
          baseData.status = "PAID";
          baseData.paidAt = paymentDate ?? occurredAt;
        } else {
          baseData.status = "APPROVED";
          if (paymentDate) baseData.remindAt = paymentDate;
        }

        const entry = await tx.financeEntry.create({
          data: baseData,
          select: { id: true, amount: true },
        });
        createdInvoiceIds.push(entry.id);

        if (inv.isPaid) {
          const payment = await tx.supplierPayment.create({
            data: {
              counterpartyId,
              firmId,
              projectId: inv.matchedProjectId ?? null,
              amount: entry.amount,
              currency: "UAH",
              occurredAt: paymentDate ?? occurredAt,
              method: "BANK_TRANSFER",
              reference: inv.invoiceNumber,
              status: "POSTED",
              createdById: userId,
              notes: "Імпорт з xlsx (кошторисниця)",
              allocations: {
                create: {
                  financeEntryId: entry.id,
                  amount: entry.amount,
                },
              },
            },
            select: { id: true },
          });
          createdPaymentIds.push(payment.id);
        }
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Counterparties created: ${createdCounterpartyIds["metrum-group"].length} Group + ${createdCounterpartyIds["metrum-studio"].length} Studio`);
  console.log(`   FinanceEntry created: ${createdInvoiceIds.length}`);
  console.log(`   SupplierPayment + Allocation created: ${createdPaymentIds.length}`);
  console.log(`   Skipped: ${skipped.length}`);
  console.log(`   Errors: ${errors.length}`);
  if (skipped.length > 0 && skipped.length <= 20) {
    console.log("\n   Skipped detail:");
    for (const s of skipped) console.log(`     R${s.rowNumber}: ${s.reason}`);
  }
  if (errors.length > 0) {
    console.log("\n   Errors:");
    for (const e of errors) console.log(`     R${e.rowNumber}: ${e.error}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
