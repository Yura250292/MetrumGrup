/**
 * Заміна неточних TG-імпортів правильними FACT EXPENSE з PDF "Факт тіфані".
 *
 * 1. Архівує всі fact entries з [Telegram backfill] маркером (наші старі
 *    імпорти з TG які мали дублі, чужі чарджи, AI-помилки).
 * 2. Парсить 12 PDF з /Users/admin/Desktop/Факт тіфані/ через Gemini.
 *    Кожен PDF має акти, у кожному акті — позиції з 3 колонками:
 *    Сума (план), Факт (собівартість), Зазор (різниця).
 * 3. Створює FinanceEntry kind=FACT, type=EXPENSE, amount = Факт,
 *    occurredAt = дата акту, costType auto-detected, з description що
 *    логує план і зазор для аудиту.
 *
 * Усі попередні fact-витрати йдуть в архів — не видаляються, можна відновити
 * (isArchived=false). Маркер [fact-detail].
 *
 * Usage: npx tsx scripts/seed-tiffani-fact-expense-detailed.ts [--dry-run]
 */
import * as fs from "fs/promises";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { safeParseJson } from "../src/lib/ai/json-parse";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const PDF_DIR = "/Users/admin/Desktop/Факт тіфані";
const NEW_MARKER = "[fact-detail]";

const PROMPT = `PDF з фактичними витратами на ремонт квартири у житловому комплексі. Структура: декілька актів "Станом на DD.MM.YYYY", у кожному таблиця з колонками "№ | Найменування | Сума | Факт | Зазор | Оплата | Примітки".

ВАЖЛИВО: Сума = план/ціна для замовника, Факт = собівартість/наша витрата, Зазор = різниця (маржа).

Витягни все в JSON:
{
  "acts": [
    {
      "date": "YYYY-MM-DD",
      "items": [
        { "title": "Демонтажні роботи", "planned": 1850, "actual": 1588 }
      ]
    }
  ]
}

Правила:
- planned = "Сума"; actual = "Факт"
- Якщо у клітинці пусто або 0 — постав 0
- Пропусти ШАПКУ "Разом по виконанню"
- Пропусти підсумкові рядки актів (рядок без позиції з total)
- Числа без пробілів. "5,5" → 5.5
- Якщо в назві накладної є номер — лиши як є
- Не вигадуй позицій яких нема в PDF`;

const ItemSchema = z.object({
  title: z.string().min(1),
  planned: z.coerce.number().nonnegative().default(0),
  actual: z.coerce.number().nonnegative().default(0),
});
const ActSchema = z.object({
  date: z.string(),
  items: z.array(ItemSchema).default([]),
});
const ResponseSchema = z.object({
  acts: z.array(ActSchema).default([]),
});

const MATERIAL_PATTERNS = [
  /матеріал/i, /накладн/i, /товарн.*чек/i, /двер[іеі]/i, /меблі/i, /техніка/i,
  /кондиціонер/i, /плитка/i, /ванна/i, /рушникосушка/i, /інсталяція/i, /паркет/i,
  /осмос/i, /шторка/i, /дзеркал/i, /лампа/i, /люстра/i, /штори/i, /тюлі/i,
  /ковр/i, /стіл/i, /стільц/i, /телевіз/i, /чек/i, /інтер/i, /розетк/i,
  /вимикач/i, /світильн/i, /вентилятор/i, /плінтус/i, /трек/i,
  /клей/i, /кабель/i, /грунт/i, /фарб/i, /шпакл/i, /картон/i, /скоч/i,
];

function detectCostType(title: string): "MATERIAL" | "LABOR" {
  for (const re of MATERIAL_PATTERNS) {
    if (re.test(title)) return "MATERIAL";
  }
  return "LABOR";
}
function detectCategory(costType: "MATERIAL" | "LABOR", title: string): string {
  const t = title.toLowerCase();
  if (/(меблі|техніка|кондиціонер|телевіз|стіл|стільц|ковр|штор|тюлі|осмос|ванна|рушникосушк|люстра|світильн|плита|холодильн|пральн)/.test(t)) return "equipment";
  if (/(винесення|вивезення|вивіз|доставк|транспорт|логіст)/.test(t)) return "logistics";
  if (/(демонтаж)/.test(t)) return "demolition";
  return costType === "MATERIAL" ? "materials" : "subcontractors";
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

let cachedGemini: GoogleGenerativeAI | null = null;
function getGemini() {
  if (!cachedGemini) cachedGemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return cachedGemini;
}

async function extractFromPdf(buffer: Buffer): Promise<z.infer<typeof ResponseSchema>> {
  const model = getGemini().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const result = await model.generateContent([
    { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
    { text: PROMPT },
  ]);
  const raw = result.response.text();
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) throw new Error(`JSON parse failed: ${parsed.error}`);
  const validated = ResponseSchema.safeParse(parsed.value);
  if (!validated.success) throw new Error(`Schema invalid: ${JSON.stringify(validated.error.issues)}`);
  return validated.data;
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
    select: { id: true, title: true, financeFolderMirror: { select: { id: true } } },
  });
  const byNum = new Map<number, typeof projects[number]>();
  for (const p of projects) {
    const m = p.title.match(/(\d+)/);
    if (m) byNum.set(Number(m[1]), p);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error("SUPER_ADMIN не знайдено");

  // 1. Архівую всі fact entries з TG-імпорту
  if (!dryRun) {
    const archived = await prisma.financeEntry.updateMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        kind: "FACT",
        type: "EXPENSE",
        isArchived: false,
        OR: [
          { description: { contains: "[Telegram backfill]" } },
          { description: { contains: "Telegram (" } },
          { tgImportKey: { not: null } },
        ],
      },
      data: { isArchived: true },
    });
    console.log(`📦 Архівовано ${archived.count} TG-імпортованих FACT entries\n`);
  }

  // 2. Знайти всі PDF у папці Факт
  const files = (await fs.readdir(PDF_DIR))
    .filter((f) => f.endsWith(".pdf") && /(\d+)\s+квартира/.test(f));
  console.log(`📄 Знайдено ${files.length} PDF файлів\n`);

  let totalCreated = 0;
  let totalActualSum = 0;

  for (const filename of files) {
    const m = filename.match(/^(\d+)\s+квартира/);
    if (!m) continue;
    const aptNum = Number(m[1]);
    const project = byNum.get(aptNum);
    if (!project) {
      console.log(`  ❌ ${filename}: проект Кв ${aptNum} не знайдено`);
      continue;
    }

    console.log(`▶ ${filename} → ${project.title}`);
    const buffer = await fs.readFile(path.join(PDF_DIR, filename));

    let extracted: z.infer<typeof ResponseSchema>;
    try {
      extracted = await extractFromPdf(buffer);
    } catch (err) {
      console.error(`  ❌ Gemini error: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    let aptCount = 0;
    let aptActualSum = 0;
    for (const act of extracted.acts) {
      const occurredAt = new Date(act.date);
      if (isNaN(occurredAt.getTime())) {
        console.warn(`  ⚠ skip act with invalid date: ${act.date}`);
        continue;
      }
      for (const item of act.items) {
        if (item.actual <= 0) continue; // skip zero-actual rows
        const costType = detectCostType(item.title);
        const category = detectCategory(costType, item.title);
        aptActualSum += item.actual;
        aptCount++;
        if (dryRun) continue;
        await prisma.financeEntry.create({
          data: {
            type: "EXPENSE",
            kind: "FACT",
            status: "APPROVED",
            amount: item.actual,
            currency: "UAH",
            occurredAt,
            approvedAt: new Date(),
            approvedById: admin.id,
            projectId: project.id,
            firmId: FIRM_ID,
            folderId: project.financeFolderMirror?.id ?? null,
            category,
            costType,
            title: item.title.slice(0, 200),
            description: `${NEW_MARKER} ${act.date} · план: ${item.planned} · факт: ${item.actual} · зазор: ${(item.planned - item.actual).toFixed(2)}`,
            createdById: admin.id,
            source: "MANUAL",
          },
        });
      }
    }
    totalCreated += aptCount;
    totalActualSum += aptActualSum;
    console.log(`  ✓ ${extracted.acts.length} актів, ${aptCount} позицій, факт ${fmt(aptActualSum)} ₴`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Створено: ${totalCreated} позицій, Σ ${fmt(totalActualSum)} ₴`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
