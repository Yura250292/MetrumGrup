/**
 * Діагностика аномалій у БД для проектів Тіфані. Шукає причини розбіжностей
 * наших даних з еталонними PDF-актами.
 *
 * Виводить:
 *   1. Дублі за (projectId, amount, title-normalized) — однакові чеки
 *   2. Кластери "близнюків" по amount у межах квартири (3+ entries з тим
 *      самим числом)
 *   3. Топ-10 найдорожчих entries по кожній квартирі
 *   4. Entries з amount > 50000 (підозріло великі)
 *   5. Загальна статистика: count, sum, by costType
 *
 * Не змінює дані. Тільки звіт.
 *
 * Usage: npx tsx scripts/diagnose-tiffani-anomalies.ts [--apt 154]
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

interface EntryRow {
  id: string;
  title: string;
  amount: number;
  costType: string | null;
  occurredAt: Date;
  description: string | null;
  tgImportKey: string | null;
}

async function diagnoseProject(projectId: string, projectTitle: string) {
  console.log(`\n${"=".repeat(80)}\n▶ ${projectTitle} (${projectId})\n${"=".repeat(80)}`);

  const entries = (await prisma.financeEntry.findMany({
    where: { projectId, isArchived: false, type: "EXPENSE" },
    select: {
      id: true,
      title: true,
      amount: true,
      costType: true,
      occurredAt: true,
      description: true,
      tgImportKey: true,
    },
    orderBy: { amount: "desc" },
  })).map((e) => ({ ...e, amount: Number(e.amount) })) as EntryRow[];

  if (entries.length === 0) {
    console.log("  (немає entries)");
    return;
  }

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const byMaterial = entries.filter((e) => e.costType === "MATERIAL");
  const byLabor = entries.filter((e) => e.costType === "LABOR");
  const byOther = entries.filter((e) => e.costType !== "MATERIAL" && e.costType !== "LABOR");

  console.log(`\n📊 Загалом: ${entries.length} entries, ${fmt(total)} грн`);
  console.log(`   📦 MATERIAL: ${byMaterial.length} entries, ${fmt(byMaterial.reduce((s, e) => s + e.amount, 0))} грн`);
  console.log(`   🔨 LABOR:    ${byLabor.length} entries, ${fmt(byLabor.reduce((s, e) => s + e.amount, 0))} грн`);
  if (byOther.length > 0) {
    console.log(`   ❓ OTHER:    ${byOther.length} entries, ${fmt(byOther.reduce((s, e) => s + e.amount, 0))} грн`);
  }

  // ─── 1. Точні дублі за (amount + normalized title) ─────────────────
  const titleAmtKey = (e: EntryRow) => `${normalize(e.title)}|${e.amount.toFixed(2)}`;
  const groups = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const k = titleAmtKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  if (dupGroups.length > 0) {
    console.log(`\n🔴 Точні дублі (title+amount): ${dupGroups.length} груп`);
    let dupTotal = 0;
    for (const [_key, arr] of dupGroups.slice(0, 15)) {
      const each = arr[0].amount;
      const overshoot = each * (arr.length - 1); // зайве через дублі
      dupTotal += overshoot;
      console.log(`   • "${arr[0].title}" × ${arr.length}, кожен ${fmt(each)} грн → перебір ${fmt(overshoot)} грн`);
    }
    const fullDupTotal = dupGroups.reduce((s, [, arr]) => s + arr[0].amount * (arr.length - 1), 0);
    console.log(`   Σ перебір по точних дублях: ${fmt(fullDupTotal)} грн`);
  } else {
    console.log(`\n✓ Точних дублів немає`);
  }

  // ─── 2. Кластери amount-only (3+ entries з однаковим числом) ───────
  const byAmount = new Map<number, EntryRow[]>();
  for (const e of entries) {
    if (!byAmount.has(e.amount)) byAmount.set(e.amount, []);
    byAmount.get(e.amount)!.push(e);
  }
  const clusters = [...byAmount.entries()]
    .filter(([_amt, arr]) => arr.length >= 3 && arr[0].amount > 100)
    .sort((a, b) => b[1].length - a[1].length);
  if (clusters.length > 0) {
    console.log(`\n🟡 Кластери однакових сум (3+):`);
    for (const [amt, arr] of clusters.slice(0, 10)) {
      console.log(`   • ${fmt(amt)} грн × ${arr.length}`);
      for (const e of arr.slice(0, 3)) {
        console.log(`     - "${e.title}" (${e.id})`);
      }
      if (arr.length > 3) console.log(`     ... ще ${arr.length - 3}`);
    }
  }

  // ─── 3. Топ-10 найдорожчих ──────────────────────────────────────────
  console.log(`\n💰 Топ-10 найдорожчих:`);
  for (const e of entries.slice(0, 10)) {
    const desc = (e.description ?? "").slice(0, 60).replace(/\s+/g, " ");
    console.log(`   ${fmt(e.amount).padStart(12)} грн  ${e.costType?.padEnd(8) ?? "—"} ${e.title.slice(0, 45).padEnd(45)} | ${desc}`);
  }

  // ─── 4. Entries > 50000 ─────────────────────────────────────────────
  const big = entries.filter((e) => e.amount >= 50000);
  if (big.length > 0) {
    console.log(`\n💎 Записи > 50К грн: ${big.length}, Σ ${fmt(big.reduce((s, e) => s + e.amount, 0))} грн`);
  }
}

async function main() {
  const aptArg = process.argv.find((a, i, arr) => arr[i - 1] === "--apt");
  const aptFilter = aptArg ? Number(aptArg) : null;

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

  for (const p of projects) {
    await diagnoseProject(p.id, p.title);
  }

  // Глобальна статистика дублів через всі проекти
  console.log(`\n${"=".repeat(80)}\n📈 ГЛОБАЛЬНО\n${"=".repeat(80)}`);
  const allEntries = await prisma.financeEntry.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      isArchived: false,
      type: "EXPENSE",
    },
    select: { id: true, projectId: true, title: true, amount: true, occurredAt: true },
  });
  const total = allEntries.reduce((s, e) => s + Number(e.amount), 0);
  console.log(`Total: ${allEntries.length} entries, ${fmt(total)} грн`);

  // Cross-apartment duplicates: same title+amount in different projects
  // (legitimate when matters bought in bulk; suspicious if same chat thread)
  const crossKey = (e: { title: string; amount: unknown }) =>
    `${normalize(e.title)}|${Number(e.amount).toFixed(2)}`;
  const crossGroups = new Map<string, { projectId: string; id: string }[]>();
  for (const e of allEntries) {
    const k = crossKey(e);
    if (!crossGroups.has(k)) crossGroups.set(k, []);
    crossGroups.get(k)!.push({ projectId: e.projectId!, id: e.id });
  }
  const acrossApts = [...crossGroups.entries()]
    .filter(([, arr]) => new Set(arr.map((x) => x.projectId)).size > 1 && arr.length >= 3)
    .slice(0, 10);
  if (acrossApts.length > 0) {
    console.log(`\n🟠 Однакові title+amount у 3+ різних квартирах (можливі повтори):`);
    for (const [, arr] of acrossApts) {
      const sample = await prisma.financeEntry.findUnique({
        where: { id: arr[0].id },
        select: { title: true, amount: true },
      });
      const aptCount = new Set(arr.map((x) => x.projectId)).size;
      console.log(`   • "${sample?.title}" — ${fmt(Number(sample?.amount ?? 0))} грн × ${arr.length} (у ${aptCount} квартирах)`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
