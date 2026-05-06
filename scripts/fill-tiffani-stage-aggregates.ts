/**
 * VERIFY-only — НЕ змінює дані.
 *
 * Перевіряє коректність даних після nest-кластеризації для проектів Тіфані:
 *  1. Сума витрат проекту = sum через дерево стейджів (з recursion).
 *  2. Жодного дубля FinanceEntry за tgImportKey.
 *  3. Жоден імпортований entry не висить поза одним з 12 проектів.
 *  4. Кожен проект має mirror-папку у FINANCE.
 *
 * Стейдж-таблиця Metrum рекурсивно агрегує дітей через
 * computeStageFinanceAggregates → node.factExpense у відповіді API. UI
 * показує суму через node.factExpense, тому ручне заповнення factVolume/
 * factUnitPrice НЕ потрібне (і дослідження показало що його перетвір
 * призводив би до того ж самого числа через Math.max — тобто скрипт-
 * заповнювач був надмірний).
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

async function main() {
  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error(`Folder "${FOLDER_NAME}" не знайдено`);

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  console.log(`\n=== VERIFY ${projects.length} квартир ===\n`);

  let grandTotal = 0;
  let anyIssue = false;

  for (const p of projects) {
    const projAgg = await prisma.financeEntry.aggregate({
      where: { projectId: p.id, type: "EXPENSE", isArchived: false },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const projectSum = Number(projAgg._sum.amount ?? 0);
    grandTotal += projectSum;

    const stages = await prisma.projectStageRecord.findMany({
      where: { projectId: p.id },
      select: { id: true, customName: true, parentStageId: true },
    });

    const childrenOf = new Map<string, string[]>();
    for (const s of stages) {
      if (s.parentStageId) {
        const arr = childrenOf.get(s.parentStageId) ?? [];
        arr.push(s.id);
        childrenOf.set(s.parentStageId, arr);
      }
    }
    const descendants = (root: string): string[] => {
      const out: string[] = [];
      const stack = [root];
      while (stack.length) {
        const id = stack.pop()!;
        out.push(id);
        for (const k of childrenOf.get(id) ?? []) stack.push(k);
      }
      return out;
    };

    const rootStages = stages.filter((s) => s.parentStageId === null);
    let stageTreeSum = 0;
    for (const root of rootStages) {
      const ids = descendants(root.id);
      const agg = await prisma.financeEntry.aggregate({
        where: { stageRecordId: { in: ids }, type: "EXPENSE", isArchived: false },
        _sum: { amount: true },
      });
      stageTreeSum += Number(agg._sum.amount ?? 0);
    }

    const orphans = await prisma.financeEntry.count({
      where: { projectId: p.id, stageRecordId: null, type: "EXPENSE", isArchived: false },
    });

    const mirror = await prisma.folder.findUnique({
      where: { mirroredFromProjectId: p.id },
      select: { id: true },
    });

    const lostFromTree = projectSum - stageTreeSum - orphans;
    const status = Math.abs(lostFromTree) < 0.01 && mirror ? "✓" : "⚠";
    if (status === "⚠") anyIssue = true;

    console.log(
      `${status} ${p.title.padEnd(15)} | ` +
        `проект=${projectSum.toLocaleString("uk-UA").padStart(13)} грн | ` +
        `дерево=${stageTreeSum.toLocaleString("uk-UA").padStart(13)} грн | ` +
        `без stage=${orphans.toString().padStart(2)} | ` +
        `стейджів=${stages.length.toString().padStart(3)} (root ${rootStages.length}) | ` +
        `mirror=${mirror ? "ok" : "❌"}`,
    );
  }

  console.log(`\n--- Global checks ---`);
  console.log(`Усього у Folder: ${grandTotal.toLocaleString("uk-UA")} грн`);

  // Дублі за tgImportKey
  const dupes = await prisma.$queryRaw<Array<{ tgImportKey: string; cnt: bigint }>>`
    SELECT "tgImportKey", COUNT(*)::bigint as cnt
    FROM finance_entries
    WHERE "tgImportKey" IS NOT NULL
    GROUP BY "tgImportKey"
    HAVING COUNT(*) > 1
  `;
  if (dupes.length > 0) {
    console.log(`❌ Дублів за tgImportKey: ${dupes.length}`);
    anyIssue = true;
  } else {
    console.log(`✓ Жодних дублів за tgImportKey`);
  }

  // Імпортовані entries поза 12 проектами
  const folderProjectIds = projects.map((p) => p.id);
  const orphanByProject = await prisma.financeEntry.count({
    where: {
      tgImportKey: { not: null },
      OR: [{ projectId: null }, { projectId: { notIn: folderProjectIds } }],
    },
  });
  if (orphanByProject > 0) {
    console.log(`❌ ${orphanByProject} імпортованих entries не належать жодному з 12 проектів`);
    anyIssue = true;
  } else {
    console.log(`✓ Усі імпортовані entries належать одному з 12 проектів`);
  }

  console.log(`\n${anyIssue ? "⚠ Є попередження вище" : "✅ Усі перевірки пройдено"}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
