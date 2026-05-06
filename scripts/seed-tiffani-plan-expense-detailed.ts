/**
 * Створює PLAN EXPENSE записи з ДЕТАЛЬНОЮ розкладкою кожної позиції з PDF
 * планів-кошторисів /Users/admin/Desktop/План Тіфані/. Замінює попередні
 * 12 summary-records [plan-expense-budget] на детальні entries.
 *
 * Кожен PDF містить кілька актів (Станом на DD.MM.YYYY) з позиціями.
 * Gemini Vision витягує structured JSON. Кожна позиція → FinanceEntry
 * з occurredAt = дата акту, костType auto-detected з title.
 *
 * Idempotent через маркер [plan-detail] в description.
 *
 * Usage: npx tsx scripts/seed-tiffani-plan-expense-detailed.ts [--dry-run]
 */
import * as fs from "fs/promises";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { safeParseJson } from "../src/lib/ai/json-parse";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const PDF_DIR = "/Users/admin/Desktop/План Тіфані";
const OLD_MARKER = "[plan-expense-budget]";
const NEW_MARKER = "[plan-detail]";

const PROMPT = `Це PDF з планом витрат на ремонт КВАРТИРИ. Структура: кілька актів "Станом на DD.MM.YYYY", у кожному таблиця позицій з колонками "№ Найменування Сума".

Витягни всі акти і всі позиції в JSON:
{
  "acts": [
    {
      "date": "YYYY-MM-DD",
      "items": [
        { "title": "Демонтажні роботи", "amount": 1850 }
      ]
    }
  ]
}

Правила:
- Пропусти ШАПКУ "Разом по виконанню"
- Пропусти підсумкові рядки актів (та цифра яка стоїть наприкінці акту без позиції)
- Якщо в назві накладної є номер — лиши як є ("Матеріал Накладна 11852")
- Числа без пробілів і "грн"
- "5,5" → 5.5 (десяткова крапка)
- Не вигадуй позиції яких нема в PDF`;

const ItemSchema = z.object({
  title: z.string().min(1),
  amount: z.coerce.number().positive(),
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
  /вимикач/i, /світильн/i, /вентилятор/i, /плінтус/i, /інсталяц/i, /трек/i,
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

  // 1. Видалити старі summary plan-expense
  if (!dryRun) {
    const oldDeleted = await prisma.financeEntry.deleteMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        kind: "PLAN",
        type: "EXPENSE",
        description: { contains: OLD_MARKER },
      },
    });
    console.log(`🗑  Видалено ${oldDeleted.count} старих summary plan-expense entries\n`);
  }

  // 2. Знайти всі PDF
  const files = (await fs.readdir(PDF_DIR))
    .filter((f) => f.endsWith(".pdf") && /(\d+)\s+квартира/.test(f));
  console.log(`📄 Знайдено ${files.length} PDF файлів\n`);

  let totalCreated = 0;
  let totalSum = 0;

  for (const filename of files) {
    const m = filename.match(/^(\d+)\s+квартира/);
    if (!m) continue;
    const aptNum = Number(m[1]);
    const project = byNum.get(aptNum);
    if (!project) {
      console.log(`  ❌ ${filename}: проект Кв ${aptNum} не знайдено в Metrum`);
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
    let aptSum = 0;
    for (const act of extracted.acts) {
      const occurredAt = new Date(act.date);
      if (isNaN(occurredAt.getTime())) {
        console.warn(`  ⚠ skip act with invalid date: ${act.date}`);
        continue;
      }
      for (const item of act.items) {
        const costType = detectCostType(item.title);
        const category = detectCategory(costType, item.title);
        aptSum += item.amount;
        aptCount++;
        if (dryRun) continue;
        await prisma.financeEntry.create({
          data: {
            type: "EXPENSE",
            kind: "PLAN",
            status: "APPROVED",
            amount: item.amount,
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
            description: `${NEW_MARKER} ${act.date} · план з кошторису`,
            createdById: admin.id,
            source: "MANUAL",
          },
        });
      }
    }
    totalCreated += aptCount;
    totalSum += aptSum;
    console.log(`  ✓ ${extracted.acts.length} актів, ${aptCount} позицій, ${fmt(aptSum)} ₴`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Створено: ${totalCreated} позицій, Σ ${fmt(totalSum)} ₴`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
