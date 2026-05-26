import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { safeParseJson } from "@/lib/ai/json-parse";
import { downloadFromR2 } from "@/lib/foreman/r2";
import { classifyExpenseImage } from "@/lib/ai/classify-expense-image";
import { ocrReceiptStructured } from "@/lib/ocr/receipt-ocr";
import { parseExcelEstimate } from "@/lib/parsers/excel-estimate-parser";
import { parseKB2ActExcel } from "@/lib/parsers/kb2-act-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";

const ParsedItemSchema = z.object({
  tempId: z.string().min(1),
  costType: z.enum(["MATERIAL", "LABOR"]),
  title: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: z.number().positive().nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  supplier: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  rawLine: z.string().default(""),
  // AI proposal: один з двох заповнений (або обидва null = неможливо віднести)
  proposedStageId: z.string().nullable().optional(),
  proposedNewStageTempId: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

const NewStageSchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1).max(200),
  parentTempId: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  items: z.array(ParsedItemSchema).default([]),
  newStages: z.array(NewStageSchema).default([]),
});

export type AiParseItem = z.infer<typeof ParsedItemSchema>;
export type AiParseNewStage = z.infer<typeof NewStageSchema>;
export type AiParseResponse = z.infer<typeof ResponseSchema>;

const SYSTEM_PROMPT = `Ти — досвідчений виконроб-кошторисник будівельної компанії. Користувач описує виконані роботи та закуплені матеріали вільним текстом. Твоя задача:

1. Розпізнати окремі позиції (кожна = одна робота або один матеріал).
2. Класифікувати кожну позицію:
   - LABOR — виконана робота, вимірюється обсягом (м², м³, пог.м, шт). Дієслова: «залив», «поклав», «штукатурив», «демонтував», «фарбував».
   - MATERIAL — закуплений товар/матеріал. Слова: «купив», «взяв», «привезли», назви товарів (цемент, плитка, дошка).
3. Для кожної позиції витягни поля: title (короткий опис), quantity (число), unit (одиниця: м², м³, шт, кг, т, л, пог.м, год), unitPrice (за одиницю в грн), amount (сума в грн), supplier (постачальник якщо явно вказаний).
4. Спів́стави з існуючим деревом етапів проекту (вкладеність до 3 рівнів). Якщо позиція явно належить до існуючого етапу — постав proposedStageId = id того етапу. Якщо потрібен новий етап (наприклад, нової роботи ще немає в дереві) — створи запис у newStages з осмисленою назвою і вкажи його tempId у proposedNewStageTempId.
5. tempId: тільки для позицій і нових етапів. Префікс "i-" для позицій, "new-" для нових етапів. Унікальні.
6. Не вгадуй суми. Якщо в тексті немає кількості / ціни — лиши null.
7. confidence: 0.9+ якщо все чітко; 0.6-0.8 якщо неоднозначно; нижче 0.5 — не повертай позицію.

Будівельна логіка (типові групування):
- Демонтаж → Робота техніки → Паливо (підпідетап)
- Фундамент → Бетон (матеріали) + Заливка (робота)
- Облицювання плиткою → Плитка/Клей/Фуга (матеріали) + Кладка (робота)
- Електрика → Кабель/Розетки (матеріали) + Монтаж (робота)

Відповідай ВИКЛЮЧНО валідним JSON:
{
  "items": [
    {
      "tempId": "i-1",
      "costType": "LABOR" | "MATERIAL",
      "title": "...",
      "quantity": число або null,
      "unit": "м²"|"м³"|"шт"|"кг"|"пог.м"|"л"|"т"|"год" або null,
      "unitPrice": число або null,
      "amount": число або null,
      "supplier": "..." або null,
      "confidence": 0.85,
      "rawLine": "оригінальний фрагмент тексту",
      "proposedStageId": "<existing-stage-id>" або null,
      "proposedNewStageTempId": "new-1" або null,
      "reasoning": "коротко чому саме цей етап"
    }
  ],
  "newStages": [
    { "tempId": "new-1", "name": "Назва нового етапу", "parentTempId": null або "<id-існуючого-етапу>" або "new-<інший>" }
  ]
}`;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = (await request.json()) as {
    text?: unknown;
    fileKeys?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const fileKeys = Array.isArray(body.fileKeys)
    ? (body.fileKeys as unknown[])
        .filter(
          (f): f is { key: string; mime: string; name: string } =>
            !!f &&
            typeof f === "object" &&
            typeof (f as { key?: unknown }).key === "string" &&
            typeof (f as { mime?: unknown }).mime === "string" &&
            typeof (f as { name?: unknown }).name === "string",
        )
        .slice(0, 5)
    : [];

  if ((!text || text.length < 5) && fileKeys.length === 0) {
    return NextResponse.json(
      { error: "Введи текст або додай файл" },
      { status: 400 },
    );
  }
  if (text.length > 20_000) {
    return NextResponse.json(
      { error: "Завеликий текст (>20000 символів)" },
      { status: 400 },
    );
  }

  const stages = await prisma.projectStageRecord.findMany({
    where: { projectId, isHidden: false },
    orderBy: [{ parentStageId: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      stage: true,
      customName: true,
      parentStageId: true,
    },
  });

  const stagesPayload = stages.map((s) => ({
    id: s.id,
    name: s.customName ?? s.stage ?? "Без назви",
    parentId: s.parentStageId,
  }));

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "AI-парсер не налаштовано (відсутній GEMINI_API_KEY)" },
      { status: 503 },
    );
  }

  // ── Pre-extract items з файлів (зображення / PDF / Excel) паралельно.
  //    Класифікація MATERIAL/LABOR уже зроблена в helper-ах foreman pipeline.
  type PreItem = {
    source: string;
    costType: "MATERIAL" | "LABOR";
    title: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number;
    supplier: string | null;
  };
  const preItems: PreItem[] = [];
  const fileErrors: string[] = [];

  await Promise.all(
    fileKeys.map(async (f) => {
      try {
        const buf = await downloadFromR2(f.key);
        if (f.mime.startsWith("image/")) {
          const cls = await classifyExpenseImage(buf, f.mime);
          if (cls.type === "expense_table") {
            for (const it of cls.items) {
              preItems.push({
                source: f.name,
                costType: it.costType,
                title: it.title,
                quantity: it.quantity ?? null,
                unit: it.unit ?? null,
                unitPrice: it.unitPrice ?? null,
                amount: it.amount,
                supplier: it.supplier ?? null,
              });
            }
          } else if (cls.type === "expense_total_only" && cls.totalAmount) {
            preItems.push({
              source: f.name,
              costType: "MATERIAL",
              title: cls.summary || "Витрата з чека",
              quantity: null,
              unit: null,
              unitPrice: null,
              amount: cls.totalAmount,
              supplier: null,
            });
          }
        } else if (f.mime === "application/pdf") {
          const ocr = await ocrReceiptStructured(buf, f.mime);
          for (const it of ocr.parsed.items) {
            const amount =
              it.totalPrice ??
              (it.quantity && it.unitPrice ? it.quantity * it.unitPrice : 0);
            if (amount > 0) {
              preItems.push({
                source: f.name,
                costType: "MATERIAL",
                title: it.name,
                quantity: it.quantity ?? null,
                unit: it.unit ?? null,
                unitPrice: it.unitPrice ?? null,
                amount,
                supplier: null,
              });
            }
          }
        } else if (
          f.mime ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          f.mime === "application/vnd.ms-excel" ||
          /\.(xlsx|xls)$/i.test(f.name)
        ) {
          const ab = buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength,
          ) as ArrayBuffer;
          let added = 0;
          try {
            const xls = await parseExcelEstimate(ab);
            for (const it of xls.items) {
              if (it.totalPrice > 0) {
                preItems.push({
                  source: f.name,
                  costType: "MATERIAL",
                  title: it.description,
                  quantity: it.quantity,
                  unit: it.unit,
                  unitPrice: it.unitPrice,
                  amount: it.totalPrice,
                  supplier: null,
                });
                added++;
              }
            }
          } catch {
            /* спробуємо КБ-2в */
          }
          if (added === 0) {
            const kb2 = parseKB2ActExcel(ab);
            for (const it of kb2) {
              const ct: "MATERIAL" | "LABOR" =
                it.costType === "LABOR" ? "LABOR" : "MATERIAL";
              preItems.push({
                source: f.name,
                costType: ct,
                title: it.title,
                quantity: it.quantity ?? null,
                unit: it.unit ?? null,
                unitPrice: it.unitPrice ?? null,
                amount: it.amount,
                supplier: null,
              });
            }
          }
        } else {
          fileErrors.push(`${f.name}: непідтримуваний формат (${f.mime})`);
        }
      } catch (err) {
        console.error(`[ai-parse] file ${f.key} failed:`, err);
        fileErrors.push(
          `${f.name}: ${err instanceof Error ? err.message : "помилка обробки"}`,
        );
      }
    }),
  );

  const userPrompt = `Дерево етапів проекту "${project.title}":
${JSON.stringify(stagesPayload, null, 2)}

${text ? `Текст від виконроба:\n"""\n${text}\n"""\n` : ""}${
    preItems.length > 0
      ? `\nПозиції вже витягнуто з файлів (класифікація costType вже зроблена, її НЕ міняй — лиш признач етап + tempId; quantity/unit/unitPrice/amount теж залиш):\n${JSON.stringify(preItems, null, 2)}\n\nДля КОЖНОЇ pre-extracted позиції створи відповідний item у відповіді: костомний tempId (i-N), costType/title/quantity/unit/unitPrice/amount/supplier СКОПІЮЙ з вхідних даних, заповни proposedStageId або proposedNewStageTempId.`
      : ""
  }`;

  let parsed: AiParseResponse;
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });
    const result = await model.generateContent(userPrompt);
    const raw = result.response.text();
    const json = safeParseJson<unknown>(raw);
    if (!json.ok) {
      console.error("[ai-parse] JSON parse failed:", json.error);
      return NextResponse.json(
        { error: "AI повернув некоректний JSON" },
        { status: 502 },
      );
    }
    const validated = ResponseSchema.safeParse(json.value);
    if (!validated.success) {
      console.error(
        "[ai-parse] schema validation failed:",
        validated.error.issues,
      );
      return NextResponse.json(
        { error: "AI повернув неочікувану структуру" },
        { status: 502 },
      );
    }
    parsed = validated.data;
  } catch (err) {
    console.error("[ai-parse] Gemini error:", err);
    return NextResponse.json(
      { error: "AI-сервіс недоступний, спробуйте пізніше" },
      { status: 502 },
    );
  }

  // Санітизація: тільки позиції з confidence ≥ 0.5; proposedStageId існує
  // у дереві; proposedNewStageTempId існує у newStages.
  const existingIds = new Set(stages.map((s) => s.id));
  const newStageTempIds = new Set(parsed.newStages.map((n) => n.tempId));
  const filteredItems = parsed.items
    .filter((it) => (it.confidence ?? 0.7) >= 0.5)
    .map((it) => {
      let proposedStageId = it.proposedStageId ?? null;
      let proposedNewStageTempId = it.proposedNewStageTempId ?? null;
      if (proposedStageId && !existingIds.has(proposedStageId)) {
        proposedStageId = null;
      }
      if (
        proposedNewStageTempId &&
        !newStageTempIds.has(proposedNewStageTempId)
      ) {
        proposedNewStageTempId = null;
      }
      return { ...it, proposedStageId, proposedNewStageTempId };
    });

  // Валідуємо ієрархію newStages — parentTempId має посилатись на існуючий
  // stage або на інший newStage (рекурсія дозволена, але без циклів).
  const validNewStages = parsed.newStages
    .map((ns) => ({
      ...ns,
      parentTempId:
        ns.parentTempId &&
        (existingIds.has(ns.parentTempId) || newStageTempIds.has(ns.parentTempId)) &&
        ns.parentTempId !== ns.tempId
          ? ns.parentTempId
          : null,
    }));

  return NextResponse.json({
    data: {
      items: filteredItems,
      newStages: validNewStages,
      stages: stagesPayload,
      fileErrors,
    },
  });
}
