import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import * as XLSX from "xlsx";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { safeParseJson } from "@/lib/ai/json-parse";
import { downloadFromR2 } from "@/lib/foreman/r2";
import { parseExcelEstimate } from "@/lib/parsers/excel-estimate-parser";
import { parseKB2ActExcel } from "@/lib/parsers/kb2-act-parser";

export const runtime = "nodejs";
// 300 sec — verbal description of Excel CSV + multimodal Gemini call (на
// великих файлах 219+ рядків) часто бере 60-120 сек. Старий ліміт 60 викликав
// 504 Gateway Timeout → клієнт отримував не-JSON і кидав DOMException
// "The string did not match the expected pattern.".
export const maxDuration = 300;

const MODEL = "gemini-2.5-flash";

const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional();

// Усі числові поля приймають 0 (Gemini часто ставить 0 для категорійних
// заголовків кошторису) і null. Post-валідація нижче конвертує 0 → null
// бо це невалідний реальний обсяг/ціна, але не блокує всю відповідь.
const ParsedItemSchema = z.object({
  tempId: z.string().min(1),
  costType: z.enum(["MATERIAL", "LABOR"]),
  title: z.string().min(1).max(200),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  supplier: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  rawLine: z.string().default(""),
  proposedStageId: z.string().nullable().optional(),
  proposedNewStageTempId: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  priority: PrioritySchema,
  estimatedHours: z.number().nonnegative().nullable().optional(),
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

const SYSTEM_PROMPT = `Ти — досвідчений виконроб-кошторисник будівельної компанії. Користувач описує виконані роботи та закуплені матеріали вільним текстом І/АБО додає файли (фото чек/накладна, PDF кошторис/акт, Excel). Твоя задача — РЕТЕЛЬНО проаналізувати все надане і структурувати у позиції.

1. Розпізнати ВСІ окремі позиції (кожна = одна робота або один матеріал). Якщо файл містить кошторис/перелік — витягни КОЖЕН пункт, не пропускай. Якщо позицій багато (>20) — все одно повертай всі.

2. Класифікувати кожну позицію:
   - LABOR — виконана/планована робота: монтаж, демонтаж, заливка, кладка, штукатурка, фарбування, копання. Вимірюється обсягом виконання (м², м³, пог.м, шт, год).
   - MATERIAL — товар/матеріал: цемент, плитка, дошка, фарба, кабель, труба, бордюр. Вимірюється закупкою (шт, кг, т, л, м, м², м³).

3. Для кожної позиції витягни:
   - title — короткий опис (≤80 симв)
   - quantity — число або null
   - unit — одиниця виміру (м²/м³/шт/кг/т/л/пог.м/год/мішок/упак)
   - unitPrice — за одиницю в грн або null
   - amount — підсумок в грн або null
   - supplier — постачальник якщо явно вказаний

4. ВАЖЛИВО — для LABOR додатково:
   - priority — "HIGH" (критичний — блокує наступні роботи), "MEDIUM" (плановий), "LOW" (можна відкласти)
   - estimatedHours — оцінка часу в людино-годинах. Орієнтири: 1 м² штукатурки ≈ 0.5 год; 1 м² плитки ≈ 1 год; 1 м³ бетону ≈ 1-2 год роботи; 1 м² фарби ≈ 0.3 год; демонтаж 1 м³ ≈ 1 год.
   Якщо неможливо оцінити — null.

5. Спів́стави з існуючим деревом етапів проекту (вкладеність до 3 рівнів):
   - Якщо позиція належить існуючому етапу → proposedStageId = id того етапу
   - Якщо потрібен новий етап → запис у newStages + proposedNewStageTempId
   - Підпорядковуй матеріали тій же роботі: цемент+пісок→Фундамент; плитка+клей→Облицювання; кабель+розетки→Електрика

6. tempId: "i-N" для позицій, "new-N" для нових етапів. Унікальні.

7. Не вгадуй суми — якщо в файлі/тексті немає кількості/ціни → null.

8. confidence: 0.9+ чітко; 0.6-0.8 неоднозначно; <0.5 — НЕ повертай позицію.

Будівельна логіка типового групування етапів:
- Демонтаж → Робота техніки → Паливо
- Фундамент → Бетон (матеріали) + Заливка (робота)
- Облицювання плиткою → Плитка/Клей/Фуга (матеріали) + Кладка (робота)
- Електрика → Кабель/Розетки (матеріали) + Монтаж (робота)
- Благоустрій → Бордюри/Покриття (матеріали) + Укладка/Демонтаж (роботи)

Відповідай ВИКЛЮЧНО валідним JSON:
{
  "items": [
    {
      "tempId": "i-1",
      "costType": "LABOR" | "MATERIAL",
      "title": "...",
      "quantity": число | null,
      "unit": "м²" | "м³" | "шт" | "кг" | "пог.м" | "л" | "т" | "год" | null,
      "unitPrice": число | null,
      "amount": число | null,
      "supplier": "..." | null,
      "confidence": 0.85,
      "rawLine": "оригінальний фрагмент",
      "proposedStageId": "<id>" | null,
      "proposedNewStageTempId": "new-1" | null,
      "reasoning": "коротко чому цей етап",
      "priority": "HIGH" | "MEDIUM" | "LOW" | null,
      "estimatedHours": число | null
    }
  ],
  "newStages": [
    { "tempId": "new-1", "name": "Назва", "parentTempId": null | "<id>" | "new-<інший>" }
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

  // ── Файли: фото/PDF — інлайн напряму у Gemini multimodal call (LLM сам
  //    OCR-ить + класифікує + матчить етапи з повним контекстом).
  //    Excel — pre-parse у JSON (Gemini не читає xlsx нативно).
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
  const inlineFileParts: Part[] = [];
  const inlineFileNotes: string[] = [];
  const fileErrors: string[] = [];
  // Grid-fallback: коли структурні Excel-парсери не впізнали заголовків,
  // серіалізуємо лист у CSV-текст і додаємо до prompt — Gemini сам розбере.
  const rawExcelGrids: Array<{ name: string; csv: string }> = [];

  console.log(
    `[ai-parse] start projectId=${projectId} text-len=${text.length} files=${fileKeys.length}`,
  );

  await Promise.all(
    fileKeys.map(async (f) => {
      try {
        const buf = await downloadFromR2(f.key);
        console.log(
          `[ai-parse] file "${f.name}" mime=${f.mime} size=${buf.length} bytes`,
        );
        if (f.mime.startsWith("image/") || f.mime === "application/pdf") {
          // Gemini 2.5 нативно підтримує і image, і PDF як inlineData.
          inlineFileParts.push({
            inlineData: {
              mimeType: f.mime,
              data: buf.toString("base64"),
            },
          });
          inlineFileNotes.push(`${f.name} (${f.mime})`);
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
          if (added === 0) {
            // Структурні парсери не впізнали заголовків (нестандартний формат
            // українського кошторису, напр. «№ п/п | Найменування | Одиниця
            // виміру | Кількість | Ціна | Сума»). Серіалізуємо лист у CSV
            // і передаємо Gemini — він читає табличні дані відмінно.
            try {
              const workbook = XLSX.read(ab, { type: "array" });
              const csvParts: string[] = [];
              for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;
                const csv = XLSX.utils.sheet_to_csv(sheet, {
                  blankrows: false,
                  rawNumbers: true,
                });
                if (csv.trim().length === 0) continue;
                csvParts.push(
                  workbook.SheetNames.length > 1
                    ? `### Лист "${sheetName}"\n${csv}`
                    : csv,
                );
              }
              const fullCsv = csvParts.join("\n\n").slice(0, 60_000);
              console.log(
                `[ai-parse] Excel "${f.name}" CSV-fallback: sheets=${workbook.SheetNames.length} csv-len=${fullCsv.length}`,
              );
              if (fullCsv.length > 0) {
                rawExcelGrids.push({ name: f.name, csv: fullCsv });
              } else {
                fileErrors.push(
                  `${f.name}: Excel порожній або пошкоджений.`,
                );
              }
            } catch (excelErr) {
              console.error(`[ai-parse] Excel CSV fallback failed:`, excelErr);
              fileErrors.push(
                `${f.name}: не вдалось зчитати Excel (${
                  excelErr instanceof Error ? excelErr.message : "помилка"
                }).`,
              );
            }
          }
        } else {
          fileErrors.push(
            `${f.name}: непідтримуваний формат (${f.mime}). Підтримуються: фото, PDF, Excel.`,
          );
        }
      } catch (err) {
        console.error(`[ai-parse] file ${f.key} failed:`, err);
        fileErrors.push(
          `${f.name}: ${err instanceof Error ? err.message : "помилка обробки"}`,
        );
      }
    }),
  );

  const userPromptText = `Дерево етапів проекту "${project.title}":
${JSON.stringify(stagesPayload, null, 2)}

${text ? `Текст користувача:\n"""\n${text}\n"""\n` : ""}${
    inlineFileNotes.length > 0
      ? `\nДодано файлів (фото/PDF — інлайн нижче): ${inlineFileNotes.join(", ")}.\nПроаналізуй ВЕСЬ зміст файлів і витягни ВСІ позиції (роботи + матеріали).\n`
      : ""
  }${
    preItems.length > 0
      ? `\nПозиції витягнуто з Excel (структура чітка — costType/title/qty/price вже визначено). СКОПІЮЙ їх у items[] без змін, ТІЛЬКИ признач proposedStageId/proposedNewStageTempId і за можливістю додай priority/estimatedHours:\n${JSON.stringify(preItems, null, 2)}\n`
      : ""
  }${
    rawExcelGrids.length > 0
      ? rawExcelGrids
          .map(
            (g) =>
              `\nСирий зміст Excel-файлу "${g.name}" (структурний парсер не впізнав заголовків — розбери САМ цей CSV):\n\`\`\`csv\n${g.csv}\n\`\`\`\nВитягни КОЖНУ позицію. Український кошторис типово має колонки: «№ п/п», «Найменування», «Одиниця виміру», «Кількість», «Ціна», «Сума». Рядки що виглядають як категорії/розділи (без кількості і ціни, але з назвою типу «Демонтажні роботи», «Підготовчі роботи») — використовуй для proposedNewStageTempId, а позиції під ними прив'язуй до цього етапу.`,
          )
          .join("\n")
      : ""
  }

ОБОВ'ЯЗКОВО: якщо є файли або текст з позиціями — поверни items[] НЕ порожнім. Якщо файл є, але не містить роботів/матеріалів — все одно поверни items[] з тим що бачиш (хоча б назви розділів/етапів).`;

  console.log(
    `[ai-parse] prompt: text-len=${userPromptText.length} inline-parts=${inlineFileParts.length} pre-items=${preItems.length} raw-grids=${rawExcelGrids.length}`,
  );

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
    // Multimodal request: text-part + inline file parts (image/PDF).
    const parts: Part[] = [{ text: userPromptText }, ...inlineFileParts];
    const result = await model.generateContent(parts);
    const raw = result.response.text();
    console.log(`[ai-parse] Gemini response len=${raw.length}`);
    const json = safeParseJson<unknown>(raw);
    if (!json.ok) {
      console.error(
        "[ai-parse] JSON parse failed:",
        json.error,
        "raw[0..400]:",
        raw.slice(0, 400),
      );
      return NextResponse.json(
        {
          error: `AI повернув некоректний JSON: ${json.error}`,
          fileErrors,
        },
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
        {
          error: `AI повернув неочікувану структуру: ${validated.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
          fileErrors,
        },
        { status: 502 },
      );
    }
    parsed = validated.data;
    console.log(
      `[ai-parse] parsed: items=${parsed.items.length} newStages=${parsed.newStages.length}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-parse] Gemini error:", err);
    return NextResponse.json(
      { error: `AI-помилка: ${msg}`, fileErrors },
      { status: 502 },
    );
  }

  // Санітизація:
  //   1) Нормалізуємо 0 → null для quantity/unitPrice/amount/estimatedHours
  //      (Gemini деяким категорійним заголовкам ставить 0 — це не справжній
  //      обсяг/ціна).
  //   2) confidence ≥ 0.5
  //   3) proposedStageId існує у дереві; proposedNewStageTempId — у newStages.
  const zeroToNull = (n: number | null | undefined): number | null =>
    n === null || n === undefined || n === 0 ? null : n;

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
      return {
        ...it,
        quantity: zeroToNull(it.quantity),
        unitPrice: zeroToNull(it.unitPrice),
        amount: zeroToNull(it.amount),
        estimatedHours: zeroToNull(it.estimatedHours),
        proposedStageId,
        proposedNewStageTempId,
      };
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
