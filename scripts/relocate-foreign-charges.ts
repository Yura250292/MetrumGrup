/**
 * Перенести FinanceEntry які зараз лежать у одному проекті-квартирі, але
 * за title чітко стосуються ІНШОЇ квартири (Тіфані-проект). Виявлено
 * діагностикою: ~4.8 млн грн "забруднення" через зведені чеки на поверх.
 *
 * Логіка:
 *   1. Для кожного entry projectId in {12 квартир Тіфані}:
 *      - витягуємо число з title (наприклад "154 кв" → 154)
 *      - якщо це число відповідає ІНШІЙ квартирі — relocate
 *   2. Зміни:
 *      - projectId → новий
 *      - folderId → mirror-папка нового проекту
 *      - stageRecordId → null (стара категорія належить старому проекту)
 *      - description доповнюється "[relocated from Кв X]"
 *
 * Ідемпотентний — повторний запуск нічого не робить.
 *
 * Usage:
 *   npx tsx scripts/relocate-foreign-charges.ts --dry-run    # тільки звіт
 *   npx tsx scripts/relocate-foreign-charges.ts              # реальний запуск
 *
 * Після перенесення треба перезапустити cluster + nest для квартир, які
 * прийняли нові entries.
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

interface ProjectInfo {
  id: string;
  title: string;
  num: number;
  mirrorFolderId: string | null;
}

/**
 * Strict matching: only relocate if title clearly says "<num> кв" /
 * "Кв <num>" / "Квартира <num>". Avoids false positives from material
 * names with technical numbers (e.g. "Свердло 160мм", "Хомут 47-52мм",
 * "Канал 60*204"), which are NOT apartment references.
 */
function findReferencedApartment(
  title: string,
  ownNum: number,
  projects: Map<number, ProjectInfo>,
): ProjectInfo | null {
  const patterns: RegExp[] = [
    // "154 кв" or "154кв" — number followed by "кв" (not "квартира")
    /(\d{2,4})\s*кв(?![а-яёa-z])/giu,
    // "Кв 154" / "Кв.154" / "Кв №154"
    /кв\.?\s*[№#]?\s*(\d{2,4})(?![а-яёa-z\d])/giu,
    // "Квартира 154"
    /квартир[ауиою]?\s*[№#]?\s*(\d{2,4})/giu,
  ];

  for (const re of patterns) {
    for (const m of title.matchAll(re)) {
      const num = Number(m[1]);
      if (!projects.has(num)) continue;
      if (num === ownNum) continue;
      return projects.get(num)!;
    }
  }
  return null;
}

async function buildProjectMap(): Promise<Map<number, ProjectInfo>> {
  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true, financeFolderMirror: { select: { id: true } } },
  });

  const map = new Map<number, ProjectInfo>();
  for (const p of projects) {
    const m = p.title.match(/(\d+)/);
    if (!m) continue;
    map.set(Number(m[1]), {
      id: p.id,
      title: p.title,
      num: Number(m[1]),
      mirrorFolderId: p.financeFolderMirror?.id ?? null,
    });
  }
  return map;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const projects = await buildProjectMap();
  console.log(`Apartment numbers in Folder: ${[...projects.keys()].sort((a, b) => a - b).join(", ")}`);
  console.log(dryRun ? "🧪 DRY RUN — нічого не запишеться у БД\n" : "🚀 ВИКОНАННЯ — записи будуть переміщені\n");

  let totalRelocated = 0;
  let totalSum = 0;
  const moveStats = new Map<string, { count: number; sum: number; samples: { title: string; amount: number }[] }>();

  for (const owner of projects.values()) {
    const entries = await prisma.financeEntry.findMany({
      where: { projectId: owner.id, isArchived: false, type: "EXPENSE" },
      select: { id: true, title: true, amount: true, description: true },
    });

    for (const e of entries) {
      const target = findReferencedApartment(e.title, owner.num, projects);
      if (!target) continue;

      const amount = Number(e.amount);
      totalRelocated++;
      totalSum += amount;
      const key = `${owner.title} → ${target.title}`;
      const s = moveStats.get(key) ?? { count: 0, sum: 0, samples: [] };
      s.count++;
      s.sum += amount;
      if (s.samples.length < 3) s.samples.push({ title: e.title, amount });
      moveStats.set(key, s);

      if (dryRun) continue;

      const newDesc = `${e.description ?? ""}\n[relocated from ${owner.title}]`.trim();
      await prisma.financeEntry.update({
        where: { id: e.id },
        data: {
          projectId: target.id,
          folderId: target.mirrorFolderId,
          stageRecordId: null, // category-stages of source no longer apply
          description: newDesc,
          firmId: FIRM_ID,
        },
      });
    }
  }

  console.log(`📊 ${totalRelocated} entries → ${totalSum.toLocaleString("uk-UA")} грн перенесено\n`);
  const sortedMoves = [...moveStats.entries()].sort((a, b) => b[1].sum - a[1].sum);
  for (const [pair, s] of sortedMoves) {
    console.log(`   ${pair.padEnd(40)} | ${s.count} entries | ${s.sum.toLocaleString("uk-UA")} грн`);
    if (process.argv.includes("--samples")) {
      for (const sm of s.samples) console.log(`       "${sm.title}" — ${sm.amount.toLocaleString("uk-UA")} грн`);
    }
  }

  if (!dryRun) {
    console.log(`\n✓ Готово. Тепер запусти:`);
    console.log(`  npx tsx scripts/cluster-tiffani-stages.ts --all   (перекатегоризація)`);
    console.log(`  npx tsx scripts/nest-tiffani-works.ts --all       (поглиблення)`);
    console.log(`  npx tsx scripts/fill-tiffani-stage-aggregates.ts  (verify)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
