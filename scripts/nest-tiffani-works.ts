/**
 * Поглиблює структуру стейджів проектів-квартир Тіфані до трьох рівнів:
 *
 *   Малярні роботи (категорія, root stage)
 *     ├─ Малювання стін (робота, дочірня)
 *     │   ├─ FinanceEntry LABOR: Малювання стін 30 м²  ← на цій же роботі
 *     │   └─ Матеріали (внук-стейдж)
 *     │       ├─ FinanceEntry MATERIAL: Фарба
 *     │       └─ FinanceEntry MATERIAL: Грунтовка
 *     ├─ Шпаклювання
 *     │   └─ Матеріали → Шпаклівка
 *     └─ Загальні матеріали (loose materials що не лягли під жодну роботу)
 *
 * AI отримує всі entries категорії і повертає структуру: список робіт
 * (laborIds + materialIds для кожної) + loose materials. Скрипт створює
 * substages і перепривʼязує stageRecordId на конкретні роботи/матеріали.
 *
 * Idempotent: повторний запуск пропускає категорії де вже є дочірні стейджі.
 *
 * Usage: npx tsx scripts/nest-tiffani-works.ts [--apt 192] [--all] [--dry-run]
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { safeParseJson } from "../src/lib/ai/json-parse";

const FOLDER_NAME = "Тіфані";
const FIRM_ID = "metrum-studio";
const MODEL = "gemini-2.5-flash";

const PROMPT = `У тебе список витрат однієї категорії робіт ремонту квартири: матеріали (MATERIAL) і виконані роботи (LABOR). Згрупуй це у логічні роботи.

Кожна "робота" має:
- title — коротко що робилось ("Малювання стін", "Кладка плитки в санвузлі", "Монтаж електрики")
- laborIds — id LABOR-entries які описують саму роботу (зазвичай 1, інколи кілька якщо роботу робили частинами)
- materialIds — id MATERIAL-entries що логічно йдуть під цю роботу (фарба під малювання, плитка+клей+затирка під плиточні)

Якщо MATERIAL не належить чітко жодній роботі — клади у "looseMaterials".

Приклад:
{
  "works": [
    { "title": "Малювання стін", "laborIds": ["e1"], "materialIds": ["e2", "e3"] },
    { "title": "Шпаклювання", "laborIds": ["e4"], "materialIds": ["e5"] }
  ],
  "looseMaterials": ["e6"]
}

Правила:
- Не пропускай жоден id з вхідного списку (всі мають бути або в work або в looseMaterials)
- Назви робіт укр., у називному відмінку, без емодзі
- Якщо у категорії взагалі немає LABOR entries — поверни works=[], всі materials у looseMaterials
- Якщо у категорії 1-2 entries — НЕ створюй штучне розбиття, повертай мінімум

Поверни ВИКЛЮЧНО JSON (без markdown).

Категорія: "{CATEGORY}"
Витрати:
{ENTRIES_JSON}`;

const ResponseSchema = z.object({
  works: z
    .array(
      z.object({
        title: z.string().min(1).max(150),
        laborIds: z.array(z.string()).default([]),
        materialIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  looseMaterials: z.array(z.string()).default([]),
});

interface Args {
  apartment?: number;
  all: boolean;
  dryRun: boolean;
}
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apt" && argv[i + 1]) out.apartment = Number(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

function getGemini(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не налаштовано");
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

async function classify(
  category: string,
  entries: { id: string; title: string; costType: string | null; amount: number }[],
): Promise<z.infer<typeof ResponseSchema>> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const prompt = PROMPT.replace("{CATEGORY}", category).replace("{ENTRIES_JSON}", JSON.stringify(entries, null, 2));
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) throw new Error(`JSON parse failed: ${parsed.error}`);
  const validated = ResponseSchema.safeParse(parsed.value);
  if (!validated.success) throw new Error(`schema invalid: ${JSON.stringify(validated.error.issues)}`);
  return validated.data;
}

async function nestCategory(
  projectId: string,
  categoryStage: { id: string; customName: string | null },
  dryRun: boolean,
): Promise<{ created: number; entriesMoved: number }> {
  const name = categoryStage.customName ?? "(no name)";

  // Не повторюємо якщо вже є дочірні стейджі
  const existingChildren = await prisma.projectStageRecord.count({
    where: { parentStageId: categoryStage.id },
  });
  if (existingChildren > 0) {
    console.log(`  ↷ ${name}: вже має ${existingChildren} підстейджів — пропускаю`);
    return { created: 0, entriesMoved: 0 };
  }

  const entries = await prisma.financeEntry.findMany({
    where: { stageRecordId: categoryStage.id },
    select: { id: true, title: true, costType: true, amount: true },
  });
  if (entries.length === 0) return { created: 0, entriesMoved: 0 };

  // Категорія з 1-2 entries — не дробити
  if (entries.length < 3) {
    return { created: 0, entriesMoved: 0 };
  }

  console.log(`  • ${name}: ${entries.length} entries → AI`);

  const slice = entries.map((e) => ({
    id: e.id,
    title: e.title.slice(0, 100),
    costType: e.costType,
    amount: Number(e.amount),
  }));

  let plan: z.infer<typeof ResponseSchema>;
  try {
    plan = await classify(name, slice);
  } catch (err) {
    console.error(`    ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    return { created: 0, entriesMoved: 0 };
  }

  // Sanity: усі id мають бути використані. Якщо AI пропустив — додаємо у looseMaterials
  const usedIds = new Set<string>();
  for (const w of plan.works) {
    for (const id of w.laborIds) usedIds.add(id);
    for (const id of w.materialIds) usedIds.add(id);
  }
  for (const id of plan.looseMaterials) usedIds.add(id);
  const missing = entries.filter((e) => !usedIds.has(e.id)).map((e) => e.id);
  if (missing.length > 0) {
    plan.looseMaterials = plan.looseMaterials.concat(missing);
    console.log(`    ⚠ ${missing.length} пропущених AI → у "Загальні матеріали"`);
  }

  if (plan.works.length === 0 && plan.looseMaterials.length === entries.length) {
    console.log(`    ↷ ${name}: AI не виокремив окремих робіт — лишаємо плоско`);
    return { created: 0, entriesMoved: 0 };
  }

  if (dryRun) {
    console.log(`    [dry] works=${plan.works.length}, loose=${plan.looseMaterials.length}`);
    return { created: 0, entriesMoved: 0 };
  }

  let created = 0;
  let moved = 0;
  let sortOrder = 0;

  // Create work substages with their materials nested
  for (const work of plan.works) {
    if (work.laborIds.length === 0 && work.materialIds.length === 0) continue;

    const workStage = await prisma.projectStageRecord.create({
      data: {
        projectId,
        parentStageId: categoryStage.id,
        customName: work.title,
        kind: "STAGE",
        status: "IN_PROGRESS",
        sortOrder: sortOrder++,
      },
      select: { id: true },
    });
    created++;

    // Labor entries — directly on the work stage
    if (work.laborIds.length > 0) {
      const r = await prisma.financeEntry.updateMany({
        where: { id: { in: work.laborIds }, stageRecordId: categoryStage.id },
        data: { stageRecordId: workStage.id },
      });
      moved += r.count;
    }

    // Material entries — under a "Матеріали" grand-child
    if (work.materialIds.length > 0) {
      const matStage = await prisma.projectStageRecord.create({
        data: {
          projectId,
          parentStageId: workStage.id,
          customName: "Матеріали",
          kind: "STAGE",
          status: "IN_PROGRESS",
          sortOrder: 0,
        },
        select: { id: true },
      });
      created++;
      const r = await prisma.financeEntry.updateMany({
        where: { id: { in: work.materialIds }, stageRecordId: categoryStage.id },
        data: { stageRecordId: matStage.id },
      });
      moved += r.count;
    }
  }

  // Loose materials — separate sibling
  if (plan.looseMaterials.length > 0) {
    const looseStage = await prisma.projectStageRecord.create({
      data: {
        projectId,
        parentStageId: categoryStage.id,
        customName: "Загальні матеріали",
        kind: "STAGE",
        status: "IN_PROGRESS",
        sortOrder: sortOrder++,
      },
      select: { id: true },
    });
    created++;
    const r = await prisma.financeEntry.updateMany({
      where: { id: { in: plan.looseMaterials }, stageRecordId: categoryStage.id },
      data: { stageRecordId: looseStage.id },
    });
    moved += r.count;
  }

  console.log(`    ✓ ${name}: створено ${created} підстейджів, перенесено ${moved}`);
  return { created, entriesMoved: moved };
}

async function main() {
  const args = parseArgs();
  if (!args.apartment && !args.all) {
    console.error("Передай --apt <number> або --all");
    process.exit(1);
  }

  const folder = await prisma.folder.findFirst({
    where: { name: FOLDER_NAME, firmId: FIRM_ID, domain: "PROJECT" },
    select: { id: true },
  });
  if (!folder) throw new Error(`Folder "${FOLDER_NAME}" не знайдено`);

  const where: Record<string, unknown> = { folderId: folder.id };
  if (args.apartment) where.title = { contains: String(args.apartment) };

  const projects = await prisma.project.findMany({
    where,
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  console.log(`Поглиблення для ${projects.length} квартир${args.dryRun ? " (DRY RUN)" : ""}`);

  for (const p of projects) {
    console.log(`\n▶ ${p.title}`);
    const cats = await prisma.projectStageRecord.findMany({
      where: { projectId: p.id, parentStageId: null },
      select: { id: true, customName: true },
      orderBy: { sortOrder: "asc" },
    });
    for (const c of cats) {
      try {
        await nestCategory(p.id, c, args.dryRun);
      } catch (err) {
        console.error(`    ❌ ${c.customName}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(`\n──────\nГотово.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
