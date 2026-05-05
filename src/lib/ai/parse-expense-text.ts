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
  "rawLine": string        // вихідний рядок який розпізнано
}

Правила:
- Якщо текст НЕ про витрати (привітання, питання, обговорення) → поверни []
- MATERIAL — це товари/матеріали: плитка, цемент, фарба, грунтовка, шпаклівка, клей, дошка, профіль, гіпсокартон, провід, труба, сантехніка
- LABOR — це роботи: кладка, малярка, штукатурка, монтаж, демонтаж, шпаклювання, грунтування, фарбування, стяжка, заливка
- Якщо в тексті явно вказано «робота» або «(робота)» — це LABOR; «матеріал»/«купив»/«взяв»/«чек» — MATERIAL
- Розпізнавай формати: "плитка - 50 м2 = 3000 грн", "кладка плитки 50м² 4000", "купив грунтовку 500", "плитка 50 * 60 = 3000"
- Підтримуй українську та російську
- Якщо сума не вказана або неясна → не включай цей рядок у відповідь
- confidence: 0.9+ якщо все чітко (є сума, тип очевидний); 0.6-0.8 якщо тип/одиниця неоднозначні; <0.5 не повертай

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
  const raw = result.response.text();

  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) {
    console.warn("[parse-expense-text] JSON parse failed:", parsed.error);
    return [];
  }

  // Model sometimes wraps the array in an object — accept both shapes.
  let arr: unknown = parsed.value;
  if (arr && typeof arr === "object" && !Array.isArray(arr)) {
    const obj = arr as Record<string, unknown>;
    arr = obj.expenses ?? obj.items ?? obj.data ?? [];
  }

  const validated = ResponseSchema.safeParse(arr);
  if (!validated.success) {
    console.warn("[parse-expense-text] schema validation failed:", validated.error.issues);
    return [];
  }

  return validated.data.filter((e) => e.confidence >= 0.5);
}
