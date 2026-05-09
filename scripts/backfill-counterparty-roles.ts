/**
 * Backfill Counterparty.roles based on existing usage.
 *
 * SAFE TO RE-RUN: idempotent — recomputes roles from current data and rewrites.
 *
 * Logic (виправлено після bug-fix v2):
 *   - CLIENT   → counterparty is referenced by Project.clientCounterpartyId
 *   - SUPPLIER → counterparty has REAL evidence of being supplier:
 *                  • FinanceEntry(EXPENSE, costType IN MATERIAL/SUBCONTRACT/EQUIPMENT) АБО
 *                  • SupplierMaterial запис (довідник матеріалів) АБО
 *                  • SupplierPayment запис (платіж постачальнику)
 *                Інакше — НЕ постачальник. Зарплата (LABOR/category=salary) не
 *                робить людину постачальником.
 *   - EMPLOYEE → counterparty має FinanceEntry з category in ('salary','зарплата','зп')
 *                (підказка для UI; не блокує SUPPLIER якщо обидва справдиться).
 *   - empty    → роль не визначена (UI дає привʼязати вручну)
 *
 * Run: npx tsx scripts/backfill-counterparty-roles.ts
 */
import { PrismaClient, CounterpartyRole } from "@prisma/client";

const prisma = new PrismaClient();

const SALARY_CATEGORIES = ["salary", "зарплата", "зп", "Зарплата", "ЗП"];

async function main() {
  console.log("🔄 Backfilling Counterparty.roles…");

  const counterparties = await prisma.counterparty.findMany({
    select: { id: true, name: true, roles: true },
  });
  console.log(`  total counterparties: ${counterparties.length}`);

  const clientIds = new Set(
    (
      await prisma.project.findMany({
        where: { clientCounterpartyId: { not: null } },
        select: { clientCounterpartyId: true },
        distinct: ["clientCounterpartyId"],
      })
    )
      .map((p) => p.clientCounterpartyId)
      .filter((id): id is string => Boolean(id)),
  );
  console.log(`  used as Project.client: ${clientIds.size}`);

  // SUPPLIER — обʼєднуємо ТРИ джерела доказів:
  const supplierViaFE = (
    await prisma.financeEntry.findMany({
      where: {
        counterpartyId: { not: null },
        type: "EXPENSE",
        costType: { in: ["MATERIAL", "SUBCONTRACT", "EQUIPMENT"] },
      },
      select: { counterpartyId: true },
      distinct: ["counterpartyId"],
    })
  )
    .map((e) => e.counterpartyId)
    .filter((id): id is string => Boolean(id));

  const supplierViaSM = (
    await prisma.supplierMaterial.findMany({
      select: { counterpartyId: true },
      distinct: ["counterpartyId"],
    })
  ).map((s) => s.counterpartyId);

  const supplierViaSP = (
    await prisma.supplierPayment.findMany({
      select: { counterpartyId: true },
      distinct: ["counterpartyId"],
    })
  ).map((p) => p.counterpartyId);

  const supplierIds = new Set([...supplierViaFE, ...supplierViaSM, ...supplierViaSP]);
  console.log(
    `  SUPPLIER evidence: FE=${supplierViaFE.length}, SM=${supplierViaSM.length}, SP=${supplierViaSP.length} → unique=${supplierIds.size}`,
  );

  // EMPLOYEE — counterparty що отримував зарплату (не блокує SUPPLIER, але
  // допомагає UI відрізняти).
  const employeeIds = new Set(
    (
      await prisma.financeEntry.findMany({
        where: {
          counterpartyId: { not: null },
          type: "EXPENSE",
          category: { in: SALARY_CATEGORIES },
        },
        select: { counterpartyId: true },
        distinct: ["counterpartyId"],
      })
    )
      .map((e) => e.counterpartyId)
      .filter((id): id is string => Boolean(id)),
  );
  console.log(`  seen on salary entries: ${employeeIds.size}`);

  let updated = 0;
  let skipped = 0;
  let lostSupplier = 0;
  let gainedSupplier = 0;
  for (const c of counterparties) {
    const next = new Set<CounterpartyRole>();
    if (clientIds.has(c.id)) next.add("CLIENT");
    if (supplierIds.has(c.id)) next.add("SUPPLIER");
    if (employeeIds.has(c.id)) next.add("EMPLOYEE");

    const current = new Set(c.roles);
    const same =
      current.size === next.size && [...next].every((r) => current.has(r));
    if (same) {
      skipped++;
      continue;
    }
    if (current.has("SUPPLIER") && !next.has("SUPPLIER")) {
      lostSupplier++;
      console.log(`  − SUPPLIER знято: "${c.name}"`);
    }
    if (!current.has("SUPPLIER") && next.has("SUPPLIER")) {
      gainedSupplier++;
    }
    await prisma.counterparty.update({
      where: { id: c.id },
      data: { roles: { set: [...next] } },
    });
    updated++;
  }
  console.log(
    `\n  updated: ${updated}, unchanged: ${skipped}, lost SUPPLIER: ${lostSupplier}, gained SUPPLIER: ${gainedSupplier}`,
  );
  console.log("✅ done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
