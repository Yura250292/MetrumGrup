/**
 * Backfill Counterparty.roles based on existing usage.
 *
 * SAFE TO RE-RUN: idempotent — recomputes roles from current data and rewrites.
 *
 * Logic:
 *   - CLIENT  → counterparty is referenced by Project.clientCounterpartyId
 *   - SUPPLIER→ counterparty has any FinanceEntry with type=EXPENSE
 *   - empty   → leave [] (UI surfaces it as "роль не визначена" і дає присвоїти вручну)
 *
 * One counterparty can carry multiple roles (e.g. CLIENT + SUPPLIER).
 *
 * Run: npx tsx scripts/backfill-counterparty-roles.ts
 */
import { PrismaClient, CounterpartyRole } from "@prisma/client";

const prisma = new PrismaClient();

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
  console.log(`  counterparties used as Project.client: ${clientIds.size}`);

  const supplierIds = new Set(
    (
      await prisma.financeEntry.findMany({
        where: { counterpartyId: { not: null }, type: "EXPENSE" },
        select: { counterpartyId: true },
        distinct: ["counterpartyId"],
      })
    )
      .map((e) => e.counterpartyId)
      .filter((id): id is string => Boolean(id)),
  );
  console.log(`  counterparties seen on EXPENSE entries: ${supplierIds.size}`);

  let updated = 0;
  let skipped = 0;
  for (const c of counterparties) {
    const next = new Set<CounterpartyRole>();
    if (clientIds.has(c.id)) next.add("CLIENT");
    if (supplierIds.has(c.id)) next.add("SUPPLIER");

    const current = new Set(c.roles);
    const same =
      current.size === next.size && [...next].every((r) => current.has(r));
    if (same) {
      skipped++;
      continue;
    }
    await prisma.counterparty.update({
      where: { id: c.id },
      data: { roles: { set: [...next] } },
    });
    updated++;
  }
  console.log(`  updated: ${updated}, unchanged: ${skipped}`);
  console.log("✅ done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
