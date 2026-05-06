import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { safeParseJson } from "./json-parse";

const MODEL = "gemini-2.5-flash";

const PROMPT = `Ти асистент який розпізнає витрати на будівельному проекті з вільного тексту майстра в Telegram.

Поверни ВИКЛЮЧНО валідний JSON-масив (без markdown-fence, без пояснень). Кожен елемент:
{
  "costType": "MATERIAL" | "LABOR",
  "title": string,         // короткий опис, напр. "Плитка" або "Кладка плитки"
  "quantity": число або null,
  "unit": string або null, // м², шт, кг, год, м, м³, мішок, упак
  "unitPrice": число або null,
  "amount": число,         // підсумок в гривнях
  "currency": "UAH",
  "confidence": число 0..1,
  "rawLine": string,       // вихідний рядок який розпізнано
  "apartmentNumber": число або null  // ← КРИТИЧНО: див. правила нижче
}

Правила класифікації:
- Якщо текст НЕ про витрати (привітання, питання, обговорення) → поверни []
- MATERIAL — це товари/матеріали: плитка, цемент, фарба, грунтовка, шпаклівка, клей, дошка, профіль, гіпсокартон, провід, труба, сантехніка
- LABOR — це роботи: кладка, малярка, штукатурка, монтаж, демонтаж, шпаклювання, грунтування, фарбування, стяжка, заливка
- Якщо в тексті явно вказано «робота» або «(робота)» — це LABOR; «матеріал»/«купив»/«взяв»/«чек» — MATERIAL
- Розпізнавай формати: "плитка - 50 м2 = 3000 грн", "кладка плитки 50м² 4000", "купив грунтовку 500"
- Підтримуй українську та російську
- Якщо сума не вказана або неясна → не включай цей рядок у відповідь
- confidence: 0.9+ якщо все чітко; 0.6-0.8 якщо тип/одиниця неоднозначні; <0.5 не повертай

ПРАВИЛО apartmentNumber (КРИТИЧНО для уникнення помилок з зведеними чеками):
- Якщо в рядку Є явна згадка номеру квартири — "192 кв", "Кв 154", "квартира 49", "Кв.49" — вкажи цей номер.
  Це означає, що рядок стосується ТІЄЇ квартири, а не тієї, у якій майстер пише.
- Зведені чеки на весь поверх часто виглядають так:
    "плитка для квартир: 154 кв — 3000, 159 кв — 3000, 164 кв — 3000"
  → 3 окремі items з apartmentNumber: 154, 159, 164.
- НЕ плутай із номерами накладних/чеків ("Накладна 154", "Чек 192"):
  тут "154" і "192" — це номер документу, apartmentNumber=null.
- НЕ плутай із розмірами/моделями ("Свердло 160мм", "Хомут 47-52мм", "Канал 60×204"):
  числа це габарити, apartmentNumber=null.
- Якщо в рядку нема явної згадки квартири → apartmentNumber=null.

Текст для аналізу:
\`\`\`
{TEXT}
\`\`\``;

const ParsedExpenseSchema = z.object({
  costType: z.enum(["MATERIAL", "LABOR"]),
  title: z.string().min(1).max(200),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  amount: z.number().positive(),
  currency: z.string().default("UAH"),
  confidence: z.number().min(0).max(1).default(0.7),
  rawLine: z.string().default(""),
  apartmentNumber: z.number().int().positive().nullable().optional(),
});

const ResponseSchema = z.array(ParsedExpenseSchema);

export type ParsedExpense = z.infer<typeof ParsedExpenseSchema>;

export class ExpenseParserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseParserUnavailableError";
  }
}

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new ExpenseParserUnavailableError("GEMINI_API_KEY не налаштовано");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return cachedClient;
}

function coerce(raw: string): ParsedExpense[] {
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) {
    console.warn("[parse-expense] JSON parse failed:", parsed.error);
    return [];
  }
  let arr: unknown = parsed.value;
  if (arr && typeof arr === "object" && !Array.isArray(arr)) {
    const obj = arr as Record<string, unknown>;
    arr = obj.expenses ?? obj.items ?? obj.data ?? [];
  }
  const validated = ResponseSchema.safeParse(arr);
  if (!validated.success) {
    console.warn("[parse-expense] schema validation failed:", validated.error.issues);
    return [];
  }
  return validated.data.filter((e) => e.confidence >= 0.5);
}

/**
 * Parse a free-form Telegram message into a structured list of expenses.
 * Returns [] for non-expense chatter or when the model can't extract anything
 * with sufficient confidence. Never throws on parsing issues — only on missing
 * API key or transport errors.
 */
export async function parseExpenseText(text: string): Promise<ParsedExpense[]> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 5) return [];

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });

  const prompt = PROMPT.replace("{TEXT}", trimmed);
  const result = await model.generateContent(prompt);
  return coerce(result.response.text());
}

const VISION_PROMPT = `Це фото чека, накладної, рахунку або фото з рукописом — список витрат на будівельний проект.

Поверни ВИКЛЮЧНО валідний JSON-масив (без markdown-fence, без пояснень). Кожен елемент:
{
  "costType": "MATERIAL" | "LABOR",
  "title": string,
  "quantity": число або null,
  "unit": string або null,
  "unitPrice": число або null,
  "amount": число,
  "currency": "UAH",
  "confidence": число 0..1,
  "rawLine": string
}

Правила: див. правила класифікації matierial/labor як у текстовому парсері. Якщо це чек з постачальника — зазвичай весь список = MATERIAL.
Якщо нечитко — пропусти позицію.`;

/**
 * Parse expenses from an image (photo, scan) via Gemini Vision in a single shot.
 */
export async function parseExpenseFromImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedExpense[]> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: buffer.toString("base64") } },
    { text: VISION_PROMPT },
  ]);
  return coerce(result.response.text());
}
