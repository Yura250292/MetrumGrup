/**
 * Round 2 діагностики: пошук "функціональних дублів" (не db-unique-violation,
 * а одне й те саме повторено двічі) у БД проектів-квартир Тіфані.
 *
 * Шукає в межах одного projectId пари entries з:
 *   - однаковим amount (точне співпадіння)
 *   - схожим title (нормалізований префікс 15 символів збігається)
 *   - tgImportKey ≠ (різні повідомлення Telegram)
 *
 * Не змінює дані. Виводить групи для ручної перевірки менеджером —
 * частина буде legitimate (плитка для двох санвузлів), частина — дублі
 * (одне фото скинули двічі з різницею 2 дні).
 *
 * Usage: npx tsx scripts/find-fuzzy-duplicates.ts [--apt 154]
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
    .slice(0, 15);
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

async function main() {
  const aptIdx = process.argv.indexOf("--apt");
  const aptFilter = aptIdx >= 0 && process.argv[aptIdx + 1] ? Number(process.argv[aptIdx + 1]) : null;

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const where: Record<string, unknown> = { folderId: folder.id };
  if (aptFilter) where.title = { contains: String(aptFilter) };

  const projects = await prisma.project.findMany({
    where,
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  let totalDupGroups = 0;
  let totalOvershoot = 0;

  for (const p of projects) {
    const entries = await prisma.financeEntry.findMany({
      where: { projectId: p.id, isArchived: false, type: "EXPENSE" },
      select: { id: true, title: true, amount: true, occurredAt: true, createdAt: true, tgImportKey: true },
    });

    // Group by normalized title prefix + exact amount
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = `${normalize(e.title)}|${Number(e.amount).toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    const suspects = [...groups.entries()].filter(([, arr]) => arr.length >= 2);
    if (suspects.length === 0) continue;

    let aptOvershoot = 0;
    console.log(`\n▶ ${p.title}`);
    for (const [key, arr] of suspects.slice(0, 30)) {
      const each = Number(arr[0].amount);
      const overshoot = each * (arr.length - 1);
      aptOvershoot += overshoot;
      const dates = arr.map((e) => e.createdAt.toLocaleDateString("uk-UA")).join(", ");
      const tgKeys = arr.map((e) => e.tgImportKey?.split(":").slice(2).join(":") ?? "—").join(" / ");
      console.log(`  • "${arr[0].title.slice(0, 40)}" × ${arr.length}, ${fmt(each)} грн, перебір ~${fmt(overshoot)} грн`);
      console.log(`     dates: ${dates}  | msgs: ${tgKeys}`);
    }
    console.log(`  Σ підозрілий перебір: ${fmt(aptOvershoot)} грн`);
    totalDupGroups += suspects.length;
    totalOvershoot += aptOvershoot;
  }

  console.log(`\n${"=".repeat(60)}\nЗагалом: ${totalDupGroups} підозрілих груп, ${fmt(totalOvershoot)} грн потенційного перебору`);
  console.log(`Не всі це справжні дублі — перевір в admin UI кожен випадок.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
