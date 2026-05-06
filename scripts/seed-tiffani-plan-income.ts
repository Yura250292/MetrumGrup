/**
 * Створює планові доходи (FinanceEntry kind=PLAN, type=INCOME, status=APPROVED)
 * для кожної квартири Тіфані за формулою: площа × ціна-за-м².
 *
 * Тарифи:
 *   1-кімнатна (1 кімната) → 850 USD/м²
 *   2-кімнатна (2 кімнати) → 800 USD/м²
 *
 * Idempotent: повторний запуск пропускає вже створені записи (за
 * description-маркером "[plan-income-seed]").
 *
 * Usage: npx tsx scripts/seed-tiffani-plan-income.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";

interface ApartmentInfo {
  num: number;
  rooms: 1 | 2;
  area: number;
}

const APARTMENTS: ApartmentInfo[] = [
  { num: 49, rooms: 1, area: 38.3 },
  { num: 52, rooms: 2, area: 65.1 },
  { num: 54, rooms: 1, area: 43.9 },
  { num: 154, rooms: 1, area: 37.1 },
  { num: 159, rooms: 1, area: 37.1 },
  { num: 160, rooms: 2, area: 68.7 },
  { num: 164, rooms: 1, area: 37.0 },
  { num: 192, rooms: 2, area: 63.7 },
  { num: 197, rooms: 2, area: 64.2 },
  { num: 201, rooms: 2, area: 65.4 },
  { num: 204, rooms: 2, area: 65.6 },
  { num: 205, rooms: 2, area: 68.7 },
];

const PRICE_PER_SQM: Record<1 | 2, number> = {
  1: 850,
  2: 800,
};

const SEED_MARKER = "[plan-income-seed]";

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error(`Folder "${FOLDER_NAME}" не знайдено`);

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true, financeFolderMirror: { select: { id: true } } },
  });

  const projByNum = new Map<number, typeof projects[number]>();
  for (const p of projects) {
    const m = p.title.match(/(\d+)/);
    if (m) projByNum.set(Number(m[1]), p);
  }

  const adminUser = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true },
  });
  if (!adminUser) throw new Error("SUPER_ADMIN не знайдено");

  console.log(dryRun ? "🧪 DRY RUN\n" : "🚀 Створюю планові доходи\n");

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalUSD = 0;

  for (const apt of APARTMENTS) {
    const project = projByNum.get(apt.num);
    if (!project) {
      console.log(`  ❌ Квартира ${apt.num}: проект не знайдено`);
      continue;
    }
    const pricePerSqm = PRICE_PER_SQM[apt.rooms];
    const total = Number((apt.area * pricePerSqm).toFixed(2));
    const title = `Виручка від замовника: ${apt.area} м² × $${pricePerSqm}`;

    const existing = await prisma.financeEntry.findFirst({
      where: {
        projectId: project.id,
        kind: "PLAN",
        type: "INCOME",
        description: { contains: SEED_MARKER },
      },
      select: { id: true, amount: true },
    });
    if (existing) {
      console.log(`  ↷ Кв ${apt.num.toString().padStart(3)}: уже є PLAN INCOME (${fmt(Number(existing.amount))} USD)`);
      totalSkipped++;
      continue;
    }

    totalUSD += total;
    if (dryRun) {
      console.log(`  + [dry] Кв ${apt.num.toString().padStart(3)}: ${apt.area} м² × $${pricePerSqm} = $${fmt(total)}`);
      continue;
    }

    await prisma.financeEntry.create({
      data: {
        type: "INCOME",
        kind: "PLAN",
        status: "APPROVED",
        amount: total,
        currency: "USD",
        occurredAt: new Date(),
        approvedAt: new Date(),
        approvedById: adminUser.id,
        projectId: project.id,
        firmId: FIRM_ID,
        folderId: project.financeFolderMirror?.id ?? null,
        category: "client_advance",
        title,
        description: `${SEED_MARKER} ${apt.area} м² × $${pricePerSqm}/м² (${apt.rooms}-кімнатна)`,
        createdById: adminUser.id,
        source: "MANUAL",
      },
    });
    console.log(`  ✓ Кв ${apt.num.toString().padStart(3)}: ${apt.area} м² × $${pricePerSqm} = $${fmt(total)}`);
    totalCreated++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Створено: ${totalCreated}, пропущено (вже були): ${totalSkipped}`);
  console.log(`Загалом плановий дохід: $${fmt(totalUSD)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
