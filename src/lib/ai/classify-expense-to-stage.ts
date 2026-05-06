/**
 * On-the-fly classification of a parsed expense into the project's stage tree.
 *
 * Given a list of ParsedExpense + projectId:
 *   1. Loads all stage records of the project, builds breadcrumbs
 *      (e.g. "Малярні роботи / Шпаклювання / Матеріали").
 *   2. Asks Gemini to pick the best leaf stage_id for each expense.
 *   3. Returns the same expenses augmented with stageRecordId + breadcrumb,
 *      ready to be saved as FinanceEntry with structural placement.
 *
 * If the project has no stages yet (new apartment) — returns expenses with
 * stageRecordId=null. The expense will land on the project root and be
 * categorized later via cluster-script or by the manager in UI.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "../prisma";
import { safeParseJson } from "./json-parse";
import type { ParsedExpense } from "./parse-expense-text";

const MODEL = "gemini-2.5-flash";

export type ClassifiedExpense = ParsedExpense & {
  stageRecordId: string | null;
  breadcrumb: string | null;
};

const PROMPT = `Я даю тобі список витрат на ремонт квартири і дерево існуючих категорій робіт цього проекту. Для кожної витрати обери ОДИН найкращий stage_id (листок дерева або проміжний рівень).

Правила:
- Обирай найбільш специфічний (глибший) рівень, що пасує. Якщо є "Малярні роботи / Шпаклювання / Матеріали" і витрата це шпаклівка-матеріал — обирай саме цей листок.
- Якщо є дерево "Категорія / Робота / Матеріали" — матеріал-чек йде у "Матеріали" підстейдж відповідної роботи.
- Якщо жоден stage не пасує — поверни stage_id=null.
- LABOR-витрата (виконана робота) йде на стейдж самої роботи (Малювання стін), а не на її Матеріали.
- MATERIAL-витрата йде у Матеріали найближчої роботи цієї категорії, або у "Загальні матеріали" якщо є такий sibling.

Поверни ВИКЛЮЧНО валідний JSON (без markdown):
{
  "assignments": [
    { "expenseIndex": 0, "stage_id": "cm123..." | null }
  ]
}

Витрати (за індексом):
{EXPENSES_JSON}

Дерево стейджів проекту (формат: "id|глибина|шлях"):
{TREE_TXT}`;

const ResponseSchema = z.object({
  assignments: z
    .array(
      z.object({
        expenseIndex: z.number().int().nonnegative(),
        stage_id: z.string().nullable(),
      }),
    )
    .default([]),
});

let cachedClient: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не налаштовано");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return cachedClient;
}

interface StageNode {
  id: string;
  customName: string | null;
  parentStageId: string | null;
}

function buildBreadcrumbs(stages: StageNode[]): Map<string, { breadcrumb: string; depth: number }> {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const cache = new Map<string, { breadcrumb: string; depth: number }>();
  const resolve = (id: string): { breadcrumb: string; depth: number } => {
    if (cache.has(id)) return cache.get(id)!;
    const s = byId.get(id);
    if (!s) return { breadcrumb: "", depth: 0 };
    const name = s.customName ?? "(без назви)";
    if (!s.parentStageId) {
      const r = { breadcrumb: name, depth: 0 };
      cache.set(id, r);
      return r;
    }
    const parent = resolve(s.parentStageId);
    const r = { breadcrumb: `${parent.breadcrumb} / ${name}`, depth: parent.depth + 1 };
    cache.set(id, r);
    return r;
  };
  for (const s of stages) resolve(s.id);
  return cache;
}

/**
 * Classify each expense into the most specific existing stage of the project.
 * Returns the same array with stageRecordId+breadcrumb attached. Never throws —
 * on AI failure all expenses get stageRecordId=null.
 */
export async function classifyExpensesToStage(
  expenses: ParsedExpense[],
  projectId: string,
): Promise<ClassifiedExpense[]> {
  if (expenses.length === 0) return [];

  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId, isHidden: false },
    select: { id: true, customName: true, parentStageId: true },
  });

  // Empty tree — return as-is
  if (stages.length === 0) {
    return expenses.map((e) => ({ ...e, stageRecordId: null, breadcrumb: null }));
  }

  const breadcrumbs = buildBreadcrumbs(stages);
  const treeTxt = stages
    .map((s) => {
      const meta = breadcrumbs.get(s.id);
      return `${s.id}|${meta?.depth ?? 0}|${meta?.breadcrumb ?? s.customName ?? ""}`;
    })
    .join("\n");

  const expensesPayload = expenses.map((e, i) => ({
    index: i,
    title: e.title.slice(0, 100),
    costType: e.costType,
    amount: e.amount,
    rawLine: e.rawLine?.slice(0, 200) ?? "",
  }));

  let raw: string;
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const prompt = PROMPT.replace("{EXPENSES_JSON}", JSON.stringify(expensesPayload, null, 2)).replace(
      "{TREE_TXT}",
      treeTxt,
    );
    const result = await model.generateContent(prompt);
    raw = result.response.text();
  } catch (err) {
    console.warn("[classify-stage] Gemini error:", err instanceof Error ? err.message : err);
    return expenses.map((e) => ({ ...e, stageRecordId: null, breadcrumb: null }));
  }

  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) {
    console.warn("[classify-stage] JSON parse failed:", parsed.error);
    return expenses.map((e) => ({ ...e, stageRecordId: null, breadcrumb: null }));
  }
  const validated = ResponseSchema.safeParse(parsed.value);
  if (!validated.success) {
    return expenses.map((e) => ({ ...e, stageRecordId: null, breadcrumb: null }));
  }

  const idSet = new Set(stages.map((s) => s.id));
  const byIndex = new Map<number, string | null>();
  for (const a of validated.data.assignments) {
    byIndex.set(a.expenseIndex, a.stage_id && idSet.has(a.stage_id) ? a.stage_id : null);
  }

  return expenses.map((e, i) => {
    const stageId = byIndex.get(i) ?? null;
    return {
      ...e,
      stageRecordId: stageId,
      breadcrumb: stageId ? breadcrumbs.get(stageId)?.breadcrumb ?? null : null,
    };
  });
}
