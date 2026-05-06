/**
 * Конвертує PLAN INCOME записи Тіфані з USD у UAH за курсом НБУ.
 *
 * Metrum зведена таблиця додає amount без огляду на currency (показує всі
 * як ₴), тому USD-записи занижували "Доходи" у звіті. Цей скрипт:
 *   1. Отримує курс USD/UAH з НБУ API
 *   2. Знаходить PLAN INCOME з [plan-income-seed] маркером
 *   3. Оновлює amount = amount × rate, currency = UAH, description логує курс
 *
 * Idempotent: повторно не конвертує якщо currency вже UAH.
 *
 * Usage: npx tsx scripts/convert-plan-income-to-uah.ts [--dry-run] [--rate 43.97]
 */
import { prisma } from "../src/lib/prisma";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const SEED_MARKER = "[plan-income-seed]";

interface NBURate {
  rate: number;
  date: string;
}

async function getUSDRate(): Promise<NBURate> {
  const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
  if (!res.ok) throw new Error(`NBU API failed: ${res.status}`);
  const data = (await res.json()) as Array<{ rate: number; exchangedate: string }>;
  if (!data[0]) throw new Error("NBU returned no USD rate");
  return { rate: data[0].rate, date: data[0].exchangedate };
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rateArgIdx = process.argv.indexOf("--rate");
  let rateInfo: NBURate;
  if (rateArgIdx >= 0 && process.argv[rateArgIdx + 1]) {
    rateInfo = { rate: Number(process.argv[rateArgIdx + 1]), date: "manual" };
  } else {
    rateInfo = await getUSDRate();
  }
  console.log(`USD rate: ${rateInfo.rate} (date: ${rateInfo.date})\n`);

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder Тіфані не знайдено");

  const projects = await prisma.project.findMany({
    where: { folderId: folder.id },
    select: { id: true, title: true },
  });

  const entries = await prisma.financeEntry.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      kind: "PLAN",
      type: "INCOME",
      description: { contains: SEED_MARKER },
    },
    select: { id: true, projectId: true, amount: true, currency: true, description: true },
  });

  console.log(dryRun ? "🧪 DRY RUN\n" : "🚀 Конвертую\n");

  let converted = 0;
  let skipped = 0;
  let totalUSD = 0;
  let totalUAH = 0;

  for (const e of entries) {
    const projectTitle = projects.find((p) => p.id === e.projectId)?.title ?? "?";
    const usdAmount = Number(e.amount);
    if (e.currency === "UAH") {
      console.log(`  ↷ ${projectTitle.padEnd(15)}: вже в UAH (${fmt(usdAmount)} ₴)`);
      skipped++;
      continue;
    }
    const uahAmount = Number((usdAmount * rateInfo.rate).toFixed(2));
    totalUSD += usdAmount;
    totalUAH += uahAmount;
    console.log(`  ${dryRun ? "+" : "✓"} ${projectTitle.padEnd(15)}: $${fmt(usdAmount)} × ${rateInfo.rate} = ${fmt(uahAmount)} ₴`);
    if (dryRun) continue;
    await prisma.financeEntry.update({
      where: { id: e.id },
      data: {
        amount: uahAmount,
        currency: "UAH",
        description: `${e.description ?? ""} [converted USD→UAH × ${rateInfo.rate} on ${rateInfo.date}]`.trim(),
      },
    });
    converted++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${dryRun ? "Буде конвертовано" : "Конвертовано"}: ${dryRun ? entries.length - skipped : converted}, пропущено (вже UAH): ${skipped}`);
  console.log(`Σ $${fmt(totalUSD)} → ${fmt(totalUAH)} ₴ (курс ${rateInfo.rate})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
