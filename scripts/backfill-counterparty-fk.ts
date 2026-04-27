/**
 * Backfill Counterparty FK on FinanceEntry and FinanceExpenseTemplate.
 *
 * SAFE TO RE-RUN: only writes when counterpartyId is NULL. Existing
 * `counterparty` string column is kept as denormalised cache and never
 * modified by this script.
 *
 * Strategy:
 *   1. Collect every distinct non-empty `counterparty` string from both tables.
 *   2. Normalise (trim + collapse whitespace + case-insensitive dedupe).
 *   3. Upsert one Counterparty row per normalised name (LEGAL by default).
 *   4. Backfill counterpartyId on rows that match by name (case-insensitive).
 *
 * Run: pnpm tsx scripts/backfill-counterparty-fk.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

async function main() {
  console.log("🔄 Backfilling counterparty FK…");

  // 1. Pull distinct names from both tables, where FK is still NULL.
  const [entryNames, templateNames] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { counterpartyId: null, NOT: { counterparty: null } },
      select: { counterparty: true },
      distinct: ["counterparty"],
    }),
    prisma.financeExpenseTemplate.findMany({
      where: { counterpartyId: null, NOT: { counterparty: null } },
      select: { counterparty: true },
      distinct: ["counterparty"],
    }),
  ]);

  const seen = new Map<string, string>(); // lowercase → canonical
  for (const row of [...entryNames, ...templateNames]) {
    const raw = row.counterparty;
    if (!raw) continue;
    const name = normaliseName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }

  console.log(`  unique names found: ${seen.size}`);

  // 2. Pull existing counterparties to avoid creating duplicates.
  const existing = await prisma.counterparty.findMany({ select: { id: true, name: true } });
  const byKey = new Map<string, string>(); // lowercase → id
  for (const c of existing) byKey.set(c.name.trim().toLowerCase(), c.id);

  // 3. Create missing ones.
  let created = 0;
  for (const [key, name] of seen) {
    if (byKey.has(key)) continue;
    const cp = await prisma.counterparty.create({
      data: { name, type: "LEGAL", isActive: true },
    });
    byKey.set(key, cp.id);
    created++;
  }
  console.log(`  Counterparty: created ${created}, reused ${seen.size - created}`);

  // 4. Backfill FinanceEntry.counterpartyId.
  let feUpdated = 0;
  const entries = await prisma.financeEntry.findMany({
    where: { counterpartyId: null, NOT: { counterparty: null } },
    select: { id: true, counterparty: true },
  });
  for (const e of entries) {
    const key = normaliseName(e.counterparty ?? "").toLowerCase();
    if (!key) continue;
    const id = byKey.get(key);
    if (!id) continue;
    await prisma.financeEntry.update({
      where: { id: e.id },
      data: { counterpartyId: id },
    });
    feUpdated++;
  }
  console.log(`  FinanceEntry: linked ${feUpdated}/${entries.length}`);

  // 5. Backfill FinanceExpenseTemplate.counterpartyId.
  let ftUpdated = 0;
  const templates = await prisma.financeExpenseTemplate.findMany({
    where: { counterpartyId: null, NOT: { counterparty: null } },
    select: { id: true, counterparty: true },
  });
  for (const t of templates) {
    const key = normaliseName(t.counterparty ?? "").toLowerCase();
    if (!key) continue;
    const id = byKey.get(key);
    if (!id) continue;
    await prisma.financeExpenseTemplate.update({
      where: { id: t.id },
      data: { counterpartyId: id },
    });
    ftUpdated++;
  }
  console.log(`  FinanceExpenseTemplate: linked ${ftUpdated}/${templates.length}`);

  console.log("✅ done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
