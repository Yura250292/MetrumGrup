/**
 * Pre-classify image content + parse expense items in a single Vision call.
 *
 * Replaces a naive parseExpenseFromImage which assumed every photo was an
 * expense. Real-world groups also carry: floor plans, room photos, chat
 * screenshots, hand-written summary calcs ("Тіфані №192 ... Все разом 40500").
 *
 * Behaviour:
 *   - non_expense  → []                — bot stays silent
 *   - expense_table → items[] populated — standard flow
 *   - expense_total_only → one summary item with the totalAmount and a
 *     description from `summary`. Used for hand-written receipts where
 *     individual lines didn't parse but the total is clearly readable.
 *   - unclear → []                     — bot stays silent (avoid spam)
 *
 * The model picks the type itself; we route based on that. Confidence on each
 * item is preserved for the existing low-confidence-warning UI.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { safeParseJson } from "./json-parse";
import type { ParsedExpense } from "./parse-expense-text";

const MODEL = "gemini-2.5-flash";

const PROMPT = `Це зображення з робочої Telegram-групи будівельного ремонту. Воно МОЖЕ бути:
  (A) чек/накладна/рахунок з постачальника (друкована таблиця з позиціями і сумами);
  (B) рукописний обрахунок майстра (на папері, в зошиті) — інколи з позиціями, інколи лише з фінальною сумою (наприклад "Робота разом 39200, Розхідні 1300, Все разом 40500");
  (C) план квартири, фото приміщення, схема, скрін чату, селфі — НЕ витрата;
  (D) щось нечітке — теж не витрата.

Поверни ВИКЛЮЧНО валідний JSON (без markdown):
{
  "type": "expense_table" | "expense_total_only" | "non_expense" | "unclear",
  "summary": string,        // короткий опис того що видно (для description запису)
  "totalAmount": число або null,  // якщо є фінальна сума ("Все разом", "Total", "Сума")
  "merchantName": string або null, // ШАПКА ЧЕКА: "ТОВ Будхата", "Епіцентр", "ФОП Петренко"
  "merchantTaxId": string або null, // ЄДРПОУ/РНОКПП якщо чітко вказано
  "items": [               // окремі позиції — лише для expense_table
    {
      "costType": "MATERIAL" | "LABOR",
      "title": string,
      "quantity": число або null,
      "unit": string або null,
      "unitPrice": число або null,
      "amount": число,
      "currency": "UAH",
      "confidence": число 0..1,
      "rawLine": string,
      "apartmentNumber": число або null  // якщо рядок явно про іншу квартиру (див. правила)
    }
  ]
}

ПРАВИЛО merchantName / merchantTaxId (КРИТИЧНО для довідника постачальників):
- Шапка чека/накладної містить назву магазину/фірми/ФОП — ВИТЯГНИ ТІЛЬКИ КОРОТКУ НАЗВУ в merchantName.
- merchantName має бути ≤80 символів. БЕЗ адреси, телефону, ІПН, реквізитів.
  Лише форма + ім'я: "ФОП Іваненко О.І.", "ТОВ Будхата", "Епіцентр".
- Скорочуй форми:
    "Фізична особа - підприємець" / "Фізичн особа - підприємець" → "ФОП"
    "Товариство з обмеженою відповідальністю" → "ТОВ"
    "Приватне підприємство" → "ПП"
- merchantTaxId — ОКРЕМО, 8-10 цифр (ЄДРПОУ для юрособи / РНОКПП-ІПН для ФОП).
  Шукай маркери: "ІПН", "РНОКПП", "ЄДРПОУ", "Код" + 8-10 цифр.
- Якщо AI бачить "ФОП Іваненко, ІПН 1234567890, м.Львів" → merchantName="ФОП Іваненко", merchantTaxId="1234567890".
- Не плутай назву постачальника з: брендами товарів, назвами проєкту, адресою.
- Якщо це рукописний обрахунок без шапки → merchantName=null.
- Якщо нечітко — null. Краще null, ніж вгадати неправильно.

ПРАВИЛО apartmentNumber:
- Якщо в чеку/обрахунку є явна згадка квартири ("192 кв", "Кв 154", "квартира 49") — це номер квартири на яку йде позиція. Зведені чеки на весь поверх — типовий випадок ("плитка: 154 кв — 3000, 159 кв — 3000").
- НЕ плутай з: номерами накладних ("Накладна 16435"), розмірами ("Свердло 160мм", "Канал 60*204"), моделями ("Franke MRG 610-52").
- Якщо явно не вказано → apartmentNumber=null.

Правила:
- Якщо це план/схема/фото без сум → type="non_expense", items=[], totalAmount=null
- Якщо чітка таблиця з позиціями → type="expense_table", items=всі позиції, totalAmount=сума якщо помічено
- Якщо рукопис де неможна розпізнати окремі позиції АЛЕ є фінальна сума → type="expense_total_only", items=[], totalAmount=число, summary=короткий опис ("Кв 192 — електрика, рукописний обрахунок, всі роботи")
- Якщо нечітко → type="unclear", всі поля порожні
- LABOR vs MATERIAL: матеріали (плитка, фарба, дошка) vs роботи (кладка, малярка, штукатурка)
- summary укр. мовою, коротко — щоб менеджер у DM зрозумів про що чек/обрахунок`;

const ItemSchema = z.object({
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

const ResponseSchema = z.object({
  type: z.enum(["expense_table", "expense_total_only", "non_expense", "unclear"]),
  summary: z.string().default(""),
  totalAmount: z.number().nullable().optional(),
  merchantName: z.string().trim().min(1).max(200).nullable().optional(),
  merchantTaxId: z.string().trim().max(50).nullable().optional(),
  items: z.array(ItemSchema).default([]),
});

export type ImageClassification = {
  type: "expense_table" | "expense_total_only" | "non_expense" | "unclear";
  summary: string;
  /// Розпарсені позиції — готові до використання як ParsedExpense[]
  items: ParsedExpense[];
  /// Якщо AI помітив тільки фінальну суму без позицій — entries містить
  /// один summary item на цю суму (зручно для існуючого pipeline).
  totalAmount: number | null;
  /// Назва постачальника з шапки чека (для resolveSupplier).
  merchantName: string | null;
  /// ЄДРПОУ/РНОКПП якщо чітко вказано (упевнений match).
  merchantTaxId: string | null;
};

let cachedClient: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не налаштовано");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return cachedClient;
}

/**
 * Single Vision call returning both classification and parsed items.
 * Never throws on parsing issues — returns {type:"unclear", items:[]} fallback.
 */
export async function classifyExpenseImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageClassification> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });

  const fallback: ImageClassification = {
    type: "unclear",
    summary: "",
    items: [],
    totalAmount: null,
    merchantName: null,
    merchantTaxId: null,
  };

  let raw: string;
  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: buffer.toString("base64") } },
      { text: PROMPT },
    ]);
    raw = result.response.text();
  } catch (err) {
    console.warn("[classify-image] Gemini error:", err instanceof Error ? err.message : err);
    return fallback;
  }

  const parsed = safeParseJson<unknown>(raw);
  if (!parsed.ok) {
    console.warn("[classify-image] JSON parse failed:", parsed.error);
    return fallback;
  }
  const validated = ResponseSchema.safeParse(parsed.value);
  if (!validated.success) {
    console.warn("[classify-image] schema invalid:", validated.error.issues);
    return fallback;
  }
  const data = validated.data;

  const merchantName = data.merchantName ?? null;
  const merchantTaxId = data.merchantTaxId ?? null;

  // Build items[] for total-only case
  if (data.type === "expense_total_only" && data.totalAmount && data.totalAmount > 0) {
    return {
      type: data.type,
      summary: data.summary,
      totalAmount: data.totalAmount,
      merchantName,
      merchantTaxId,
      items: [
        {
          costType: "LABOR",
          title: data.summary.slice(0, 100) || "Витрата (фінальна сума)",
          quantity: null,
          unit: null,
          unitPrice: null,
          amount: data.totalAmount,
          currency: "UAH",
          confidence: 0.6,
          rawLine: data.summary,
          supplier: merchantName,
        },
      ],
    };
  }

  // Filter low-confidence items in expense_table mode + propagate supplier on each.
  const items =
    data.type === "expense_table"
      ? data.items
          .filter((i) => i.confidence >= 0.5)
          .map((i) => ({ ...i, supplier: merchantName }))
      : [];

  return {
    type: data.type,
    summary: data.summary,
    totalAmount: data.totalAmount ?? null,
    merchantName,
    merchantTaxId,
    items,
  };
}
