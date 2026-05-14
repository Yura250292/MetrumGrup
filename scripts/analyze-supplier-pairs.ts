/**
 * Dry-run analysis для майбутнього dedupe постачальників між Group і Studio.
 * Нічого не пише в БД — лише друкує статистику і список пар.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeSupplierKey } from "../src/lib/financing/invoice-import/normalize-supplier";

async function main() {
  const prisma = new PrismaClient();

  const mixedSupplier = await prisma.counterparty.count({
    where: {
      roles: { has: "SUPPLIER" },
      OR: [
        { roles: { has: "CLIENT" } },
        { roles: { has: "CONTRACTOR" } },
        { roles: { has: "OTHER" } },
      ],
    },
  });
  console.log("Mixed-role (SUPPLIER + інша роль):", mixedSupplier);

  const all = await prisma.counterparty.findMany({
    where: { roles: { has: "SUPPLIER" } },
    select: {
      id: true,
      name: true,
      firmId: true,
      roles: true,
      edrpou: true,
      taxId: true,
      _count: {
        select: {
          financeEntries: true,
          supplierPayments: true,
          foremanReportItems: true,
          supplierMaterials: true,
        },
      },
    },
  });

  type Row = (typeof all)[number];
  const byKey = new Map<string, Row[]>();
  for (const c of all) {
    const k = normalizeSupplierKey(c.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
  }

  let pairs = 0;
  let soloGroup = 0;
  let soloStudio = 0;
  let other = 0;
  const pairList: { key: string; rows: Row[] }[] = [];
  for (const [k, arr] of byKey) {
    const hasG = arr.some((c) => c.firmId === "metrum-group");
    const hasS = arr.some((c) => c.firmId === "metrum-studio");
    if (hasG && hasS) {
      pairs++;
      pairList.push({ key: k, rows: arr });
    } else if (hasG) soloGroup++;
    else if (hasS) soloStudio++;
    else other++;
  }
  console.log("Унікальних ключів SUPPLIER:", byKey.size);
  console.log("  Пар Group+Studio (об'єднати):", pairs);
  console.log("  Лише Group:", soloGroup);
  console.log("  Лише Studio:", soloStudio);
  console.log("  Інше (firmId=null чи невідома фірма):", other);

  console.log("\nТоп 10 пар з активністю:");
  pairList.sort((a, b) => {
    const sumA = a.rows.reduce(
      (s, r) =>
        s +
        r._count.financeEntries +
        r._count.supplierPayments +
        r._count.foremanReportItems +
        r._count.supplierMaterials,
      0,
    );
    const sumB = b.rows.reduce(
      (s, r) =>
        s +
        r._count.financeEntries +
        r._count.supplierPayments +
        r._count.foremanReportItems +
        r._count.supplierMaterials,
      0,
    );
    return sumB - sumA;
  });
  for (const { key, rows } of pairList.slice(0, 10)) {
    console.log(`\n  [${key}]`);
    for (const r of rows) {
      const refs = `FE=${r._count.financeEntries} SP=${r._count.supplierPayments} FRI=${r._count.foremanReportItems} SM=${r._count.supplierMaterials}`;
      console.log(`    ${r.firmId ?? "—"}  ${r.name}  ${refs}`);
    }
  }

  console.log(`\nЯкщо dedupe: видалимо ~${pairs} дублікатів зі Studio (або Group),`);
  console.log(`перепошлемо їх FK на залишений запис, і всі solo set firmId=null.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
