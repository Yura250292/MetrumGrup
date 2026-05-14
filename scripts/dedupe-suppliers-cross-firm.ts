/**
 * Dedupe SUPPLIER Counterparty: робить постачальників спільними між
 * Group і Studio (firmId=null). Для кожної пари (однакова нормалізована
 * назва, обидві фірми) — залишає 1 запис, перепосилає FK з другого, видаляє.
 * Для solo SUPPLIER (тільки в одній фірмі) — просто set firmId=null.
 *
 * Usage:
 *   npx tsx scripts/dedupe-suppliers-cross-firm.ts            (dry-run)
 *   npx tsx scripts/dedupe-suppliers-cross-firm.ts --commit   (apply)
 *
 * НЕ зачіпає Counterparty з ролями CLIENT/CONTRACTOR/OTHER — тільки чистих
 * SUPPLIER. Mixed-role записи (SUPPLIER + інша роль) пропускаються з warning.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeSupplierKey } from "../src/lib/financing/invoice-import/normalize-supplier";

type Cp = {
  id: string;
  name: string;
  firmId: string | null;
  roles: string[];
  edrpou: string | null;
  taxId: string | null;
  _count: {
    financeEntries: number;
    financeTemplates: number;
    kb2Forms: number;
    kb3Forms: number;
    clientProjects: number;
    supplierPayments: number;
    foremanReportItems: number;
    supplierMaterials: number;
  };
};

function activityScore(c: Cp): number {
  const x = c._count;
  return (
    x.financeEntries +
    x.financeTemplates +
    x.kb2Forms +
    x.kb3Forms +
    x.clientProjects +
    x.supplierPayments +
    x.foremanReportItems +
    x.supplierMaterials
  );
}

async function main() {
  const commit = process.argv.includes("--commit");
  const prisma = new PrismaClient();

  console.log(commit ? "🚀 COMMIT mode" : "🟡 DRY-RUN mode");

  const all = (await prisma.counterparty.findMany({
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
          financeTemplates: true,
          kb2Forms: true,
          kb3Forms: true,
          clientProjects: true,
          supplierPayments: true,
          foremanReportItems: true,
          supplierMaterials: true,
        },
      },
    },
  })) as Cp[];

  // Skip mixed-role rows (SUPPLIER + CLIENT/CONTRACTOR/OTHER).
  const mixedRoles = all.filter((c) =>
    c.roles.some((r) => r !== "SUPPLIER"),
  );
  if (mixedRoles.length > 0) {
    console.log(
      `⚠️  Mixed-role SUPPLIER ${mixedRoles.length} — пропустимо:`,
    );
    for (const m of mixedRoles)
      console.log(`     ${m.id} ${m.name} roles=${m.roles.join(",")}`);
  }
  const pureSuppliers = all.filter(
    (c) => c.roles.every((r) => r === "SUPPLIER"),
  );

  // Group by normalized key.
  const byKey = new Map<string, Cp[]>();
  for (const c of pureSuppliers) {
    const k = normalizeSupplierKey(c.name);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
  }

  const pairs: { key: string; rows: Cp[] }[] = [];
  const solo: Cp[] = [];
  for (const [k, rows] of byKey) {
    if (rows.length === 1) {
      solo.push(rows[0]!);
    } else {
      pairs.push({ key: k, rows });
    }
  }

  console.log(
    `\n📊 ${pureSuppliers.length} pure SUPPLIER · ${pairs.length} груп для merge · ${solo.length} solo (set firmId=null)`,
  );

  let totalRepointed = 0;
  let totalDeleted = 0;
  let totalSoloUpdated = 0;
  const skippedDueToCollision: string[] = [];

  // Process pairs.
  for (const { key, rows } of pairs) {
    rows.sort((a, b) => activityScore(b) - activityScore(a));
    const winner = rows[0]!;
    const losers = rows.slice(1);

    if (commit) {
      await prisma.$transaction(
        async (tx) => {
          for (const loser of losers) {
            // SupplierMaterial colliding nameKey — delete loser's that would collide.
            const winnerMatKeys = new Set(
              (
                await tx.supplierMaterial.findMany({
                  where: { counterpartyId: winner.id },
                  select: { nameKey: true },
                })
              ).map((m) => m.nameKey),
            );
            const collidingMats = await tx.supplierMaterial.findMany({
              where: { counterpartyId: loser.id },
              select: { id: true, nameKey: true },
            });
            for (const m of collidingMats) {
              if (winnerMatKeys.has(m.nameKey)) {
                await tx.supplierMaterial.delete({ where: { id: m.id } });
              }
            }

            // Repoint all FKs.
            const updates = await Promise.all([
              tx.financeEntry.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.financeExpenseTemplate.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.kB2Form.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.kB3Form.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.project.updateMany({
                where: { clientCounterpartyId: loser.id },
                data: { clientCounterpartyId: winner.id },
              }),
              tx.supplierPayment.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.foremanReportItem.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
              tx.supplierMaterial.updateMany({
                where: { counterpartyId: loser.id },
                data: { counterpartyId: winner.id },
              }),
            ]);
            totalRepointed += updates.reduce((s, u) => s + u.count, 0);

            await tx.counterparty.delete({ where: { id: loser.id } });
            totalDeleted++;
          }

          // Set winner firmId = null AND keep edrpou/taxId from richest source.
          const bestEdrpou =
            rows.find((r) => r.edrpou && r.edrpou.trim())?.edrpou ?? null;
          const bestTaxId =
            rows.find((r) => r.taxId && r.taxId.trim())?.taxId ?? null;
          await tx.counterparty.update({
            where: { id: winner.id },
            data: {
              firmId: null,
              edrpou: bestEdrpou ?? winner.edrpou,
              taxId: bestTaxId ?? winner.taxId,
            },
          });
        },
        { timeout: 60_000 },
      );
    } else {
      // Dry-run: just log.
      const loserSummary = losers.map(
        (l) => `${l.firmId}#${l.id.slice(-6)} (act=${activityScore(l)})`,
      );
      console.log(
        `  merge [${key}] keep=${winner.firmId}#${winner.id.slice(-6)} act=${activityScore(winner)} ← ${loserSummary.join(", ")}`,
      );
    }
  }

  // Process solo: just set firmId=null.
  for (const s of solo) {
    if (commit) {
      await prisma.counterparty.update({
        where: { id: s.id },
        data: { firmId: null },
      });
      totalSoloUpdated++;
    }
  }

  if (commit) {
    console.log(`\n✅ Done:`);
    console.log(`   Merged pairs: ${pairs.length}`);
    console.log(`   FK rows repointed: ${totalRepointed}`);
    console.log(`   Counterparty deleted: ${totalDeleted}`);
    console.log(`   Solo set firmId=null: ${totalSoloUpdated}`);
    if (skippedDueToCollision.length > 0) {
      console.log(`   Collisions skipped: ${skippedDueToCollision.length}`);
    }

    // Sanity verify.
    const remainingFirm = await prisma.counterparty.count({
      where: { roles: { has: "SUPPLIER" }, firmId: { not: null } },
    });
    const remainingNull = await prisma.counterparty.count({
      where: { roles: { has: "SUPPLIER" }, firmId: null },
    });
    console.log(`\n🔎 After dedupe:`);
    console.log(`   SUPPLIER з firmId: ${remainingFirm} (має бути ~${mixedRoles.length})`);
    console.log(`   SUPPLIER з firmId=null (спільні): ${remainingNull}`);
  } else {
    console.log(`\n🟡 Dry-run — нічого не записано. Запусти з --commit.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
