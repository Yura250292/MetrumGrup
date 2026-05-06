/**
 * Видалення дублів з повторно скинутих чеків. Зберігає найстаріший entry,
 * решту переводить у isArchived=true (м'яке видалення з логом у description).
 *
 * Критерії "точного дубля":
 *   - однаковий projectId
 *   - однаковий amount (точне співпадіння Decimal)
 *   - однаковий нормалізований title (case-insensitive, без пунктуації, перші 30 симв)
 *   - tgImportKey існує (тобто це з імпорту, не ручний ввід)
 *
 * Usage:
 *   npx tsx scripts/dedup-resent-receipts.ts --dry-run
 *   npx tsx scripts/dedup-resent-receipts.ts
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true },
  });

  console.log(dryRun ? "🧪 DRY RUN — нічого не видалиться\n" : "🚀 Архівую дублі\n");

  let totalArchived = 0;
  let totalSum = 0;

  for (const p of projects) {
    const entries = await prisma.financeEntry.findMany({
      where: {
        projectId: p.id,
        isArchived: false,
        type: "EXPENSE",
        tgImportKey: { not: null },
      },
      select: { id: true, title: true, amount: true, createdAt: true, tgImportKey: true },
      orderBy: { createdAt: "asc" },
    });

    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = `${normalize(e.title)}|${Number(e.amount).toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    let aptArchived = 0;
    let aptSum = 0;
    for (const [, arr] of groups) {
      if (arr.length < 2) continue;
      const [keep, ...archive] = arr;
      for (const dup of archive) {
        const overshoot = Number(dup.amount);
        aptArchived++;
        aptSum += overshoot;
        if (dryRun) continue;
        await prisma.financeEntry.update({
          where: { id: dup.id },
          data: {
            isArchived: true,
            description: `[archived as duplicate of ${keep.id}, kept tgImportKey=${keep.tgImportKey}]`,
          },
        });
      }
    }

    if (aptArchived > 0) {
      console.log(`  ${p.title.padEnd(15)}: -${aptArchived} entries, -${fmt(aptSum)} грн`);
      totalArchived += aptArchived;
      totalSum += aptSum;
    }
  }

  console.log(`\n${"=".repeat(60)}\nВсього: ${totalArchived} entries архівовано, ${fmt(totalSum)} грн перебору знято`);
  if (!dryRun) console.log("\nЗапусти fill-tiffani-stage-aggregates.ts для verify.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
