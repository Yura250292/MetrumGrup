/**
 * Cluster imported FinanceEntry-records of an apartment into substages
 * (work categories) using Gemini 2.5-flash. AI вільно вирішує таксономію
 * категорій робіт для кожної квартири.
 *
 * Структура (1 рівень):
 *   Квартира 192 (parent stage)
 *   ├── Малярка        (новий substage)
 *   ├── Плиточні роботи
 *   ├── Електрика
 *   └── ...
 *
 * Імпортовані записи перекидаються з parent stage на substage. Скрипт
 * ідемпотентний — повторний запуск не дублює стейджі (по customName)
 * і не зачіпає вже-перепривʼязаних entries (з parent.id != квартираId).
 *
 * Usage:
 *   npx tsx scripts/cluster-tiffani-stages.ts --apt 192          # one apartment
 *   npx tsx scripts/cluster-tiffani-stages.ts --all              # all apartments
 *   npx tsx scripts/cluster-tiffani-stages.ts --apt 192 --dry-run
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { safeParseJson } from "../src/lib/ai/json-parse";

const PROJECT_SLUG = "tiffani";
const MODEL = "gemini-2.5-flash";

const PROMPT = `Ти асистент будівельного менеджера. Я даю тобі список витрат на ремонт КОНКРЕТНОЇ квартири (матеріали і роботи). Розклади їх по категоріях будівельних робіт — таких щоб менеджер бачив структуру ремонту.

Правила:
- Категорії придумай сам, природні для будівництва: "Демонтаж", "Стяжка", "Електрика", "Сантехніка", "Малярні роботи", "Плиточні роботи", "Підлога", "Підвісна стеля", "Двері", "Вікна", "Опалення/кондиціонування", "Гіпсокартон/перегородки", тощо. Все що зовсім не підходить → "Інше".
- Не створюй підкатегорій. Лише ОДИН рівень категорій.
- Назви українською, у називному відмінку. Без емодзі.
- Якщо одна позиція могла б належати кільком категоріям — обери ту, що СТАРТУЄ цей вид робіт (плитка → "Плиточні роботи", не "Матеріали").
- Матеріали і роботи однакової теми мають іти в ОДНУ категорію (плитка-матеріал і кладка плитки-робота → обидві "Плиточні роботи").

Поверни ВИКЛЮЧНО валідний JSON (без markdown, без пояснень):
{
  "categories": [
    { "name": "...", "entryIds": ["id1", "id2", ...] }
  ]
}

Кожен entry має бути у рівно одній категорії. Не пропускай жодного entryId з вхідного списку.

Витрати квартири:
{ENTRIES_JSON}`;

const ResponseSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        entryIds: z.array(z.string()).default([]),
      }),
    )
    .min(1),
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

interface EntryForAI {
  id: string;
  title: string;
  costType: string | null;
  amount: number;
}

async function classifyEntries(entries: EntryForAI[]): Promise<{ name: string; entryIds: string[] }[]> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const prompt = PROMPT.replace("{ENTRIES_JSON}", JSON.stringify(entries, null, 2));
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) throw new Error(`Gemini JSON parse failed: ${parsed.error}`);
  const validated = ResponseSchema.safeParse(parsed.value);
  if (!validated.success) throw new Error(`Gemini schema invalid: ${JSON.stringify(validated.error.issues)}`);
  return validated.data.categories;
}

async function clusterApartment(stageId: string, customName: string, dryRun: boolean) {
  console.log(`\n▶ ${customName} (${stageId})`);

  const entries = await prisma.financeEntry.findMany({
    where: { stageRecordId: stageId, tgImportKey: { not: null } },
    select: { id: true, title: true, costType: true, amount: true },
  });
  if (entries.length === 0) {
    console.log(`  ↷ записів немає — пропускаю`);
    return;
  }
  console.log(`  • ${entries.length} записів для класифікації`);

  // Gemini має ліміт ~30K токенів на запит — для безпеки розбиваю по 200
  const BATCH = 200;
  // Map by lowercase key to avoid duplicates like "Гіпсокартон/Перегородки"
  // vs "Гіпсокартон/перегородки" coming from different batches.
  const byKey = new Map<string, { display: string; entryIds: string[] }>();
  for (let off = 0; off < entries.length; off += BATCH) {
    const slice = entries.slice(off, off + BATCH).map((e) => ({
      id: e.id,
      title: e.title.slice(0, 100),
      costType: e.costType,
      amount: Number(e.amount),
    }));
    console.log(`  → AI класифікує ${slice.length} (батч ${Math.floor(off / BATCH) + 1})`);
    const cats = await classifyEntries(slice);
    for (const c of cats) {
      const display = c.name.trim();
      const key = display.toLowerCase().replace(/\s+/g, " ");
      const acc = byKey.get(key);
      if (acc) acc.entryIds = acc.entryIds.concat(c.entryIds);
      else byKey.set(key, { display, entryIds: [...c.entryIds] });
    }
  }

  const allCategories = new Map<string, string[]>();
  for (const v of byKey.values()) allCategories.set(v.display, v.entryIds);

  const totalClassified = [...allCategories.values()].reduce((s, a) => s + a.length, 0);
  console.log(`  • ${allCategories.size} категорій, класифіковано ${totalClassified}/${entries.length}`);
  if (totalClassified < entries.length) {
    console.warn(`  ⚠ AI пропустив ${entries.length - totalClassified} записів — лишаться на батьківській квартирі`);
  }

  // Sort by total amount desc — найдорожча категорія перша
  const sumByCat = new Map<string, number>();
  for (const [name, ids] of allCategories) {
    let s = 0;
    for (const id of ids) {
      const e = entries.find((x) => x.id === id);
      if (e) s += Number(e.amount);
    }
    sumByCat.set(name, s);
  }
  const ordered = [...allCategories.keys()].sort((a, b) => (sumByCat.get(b) ?? 0) - (sumByCat.get(a) ?? 0));

  let sortOrder = 0;
  for (const name of ordered) {
    const ids = allCategories.get(name)!;
    const sum = sumByCat.get(name) ?? 0;
    console.log(`    ├ ${name}: ${ids.length} записів, ${sum.toLocaleString("uk-UA")} грн`);

    if (dryRun) {
      sortOrder++;
      continue;
    }

    // Idempotent: knife by parent + customName
    let sub = await prisma.projectStageRecord.findFirst({
      where: { parentStageId: stageId, customName: name },
      select: { id: true },
    });
    if (!sub) {
      sub = await prisma.projectStageRecord.create({
        data: {
          projectId: (await prisma.projectStageRecord.findUnique({ where: { id: stageId }, select: { projectId: true } }))!.projectId,
          parentStageId: stageId,
          customName: name,
          kind: "STAGE",
          status: "IN_PROGRESS",
          progress: 0,
          sortOrder: sortOrder++,
        },
        select: { id: true },
      });
    }
    await prisma.financeEntry.updateMany({
      where: { id: { in: ids }, stageRecordId: stageId },
      data: { stageRecordId: sub.id },
    });
  }

  console.log(`  ✓ ${customName}: створено ${ordered.length} підстейджів`);
}

async function main() {
  const args = parseArgs();
  if (!args.apartment && !args.all) {
    console.error("Передай --apt <number> або --all");
    process.exit(1);
  }

  const project = await prisma.project.findUnique({
    where: { slug: PROJECT_SLUG },
    select: { id: true },
  });
  if (!project) throw new Error("Project tiffani не знайдено");

  const stageWhere: Record<string, unknown> = {
    projectId: project.id,
    parentStageId: null,
  };
  if (args.apartment) {
    stageWhere.customName = { contains: String(args.apartment) };
  }

  const stages = await prisma.projectStageRecord.findMany({
    where: stageWhere,
    select: { id: true, customName: true },
    orderBy: { sortOrder: "asc" },
  });
  if (stages.length === 0) {
    console.error(`Не знайдено stage records для критерію ${JSON.stringify(stageWhere)}`);
    process.exit(1);
  }

  console.log(`Кластеризація для ${stages.length} квартир${args.dryRun ? " (DRY RUN)" : ""}`);
  for (const s of stages) {
    if (!s.customName) continue;
    if (s.customName.toLowerCase().includes("тестова")) continue;
    if (s.customName.toLowerCase().includes("загальна")) continue;
    try {
      await clusterApartment(s.id, s.customName, args.dryRun);
    } catch (err) {
      console.error(`  ❌ ${s.customName}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n──────\nГотово.`);
}

main()
  .catch((e) => {
    console.error("Cluster failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
