import { z } from "zod";
import { callGeminiVision } from "./gemini-client";
import { parseAmount } from "./parse-amount";

const FREEFORM_PROMPT = `Розпізнай цей чек/накладну/рахунок. Витягни структуровану інформацію українською мовою:

1. Тип документу (чек, накладна, рахунок)
2. Контрагент/Постачальник (повна назва)
3. Список товарів/послуг з цінами (якщо є)
4. Загальна сума в гривнях
5. Дата (якщо видно)

Формат відповіді:
📄 Тип: [тип документу]
🏢 Постачальник: [назва]
📋 Позиції:
- [назва товару] — [ціна] грн
- ...
💰 Сума: [загальна сума] грн
📅 Дата: [дата або "не вказано"]

Якщо щось не вдається розпізнати — напиши "не розпізнано". Відповідай ТІЛЬКИ структурованим текстом, без додаткових пояснень.`;

const STRUCTURED_PROMPT = `Розпізнай цю накладну/чек/рахунок (українська). Витягни ВСІ позиції товарів з таблиці.

Поверни ВИКЛЮЧНО валідний JSON у такому форматі (без markdown-fence, без пояснень):

{
  "supplier": "повна назва постачальника або null",
  "documentDate": "YYYY-MM-DD або null",
  "totalAmount": число або null,
  "currency": "UAH",
  "items": [
    {
      "name": "точна назва позиції з накладної",
      "quantity": число (кількість),
      "unit": "одиниця виміру (шт, кг, м, м², м³, л, упак, мішок, т)",
      "unitPrice": число (ціна за одиницю в гривнях),
      "totalPrice": число (сума по позиції) або null
    }
  ]
}

Якщо позицій нема або не зміг прочитати — повертай items: []. Якщо unit невідомий — "шт".
Числа — без пробілів і валюти, десятковий розділювач — крапка.
Якщо таблиця має колонки "Кількість, Ціна, Сума" — це quantity, unitPrice, totalPrice відповідно.`;

export interface ReceiptOcrTextResult {
  ocrText: string;
  amount: number | null;
  counterparty: string | null;
  dateRaw: string | null;
}

export interface ReceiptOcrItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number | null;
}

export interface ReceiptOcrStructuredResult {
  raw: string;
  parsed: {
    supplier: string | null;
    documentDate: Date | null;
    totalAmount: number | null;
    currency: string;
    items: ReceiptOcrItem[];
  };
}

const ItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().default("шт"),
  unitPrice: z.coerce.number().nonnegative(),
  totalPrice: z.coerce.number().nullable().optional(),
});

const StructuredSchema = z.object({
  supplier: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  totalAmount: z.coerce.number().nullable().optional(),
  currency: z.string().default("UAH"),
  items: z.array(ItemSchema).default([]),
});

/**
 * Existing freeform OCR: returns the same shape the financing modal and bot
 * already consume. Centralised so prompt and parsing live in one place.
 */
export async function ocrReceiptText(
  buffer: Buffer,
  mimeType: string,
): Promise<ReceiptOcrTextResult> {
  const ocrText = await callGeminiVision(buffer, mimeType, FREEFORM_PROMPT);

  const amountMatch = ocrText.match(/Сума:\s*([\d\s,.]+)/i);
  const amount = amountMatch ? parseAmount(amountMatch[1]) : null;

  const supplierMatch = ocrText.match(/Постачальник:\s*(.+?)(?:\n|$)/i);
  const counterparty = supplierMatch ? supplierMatch[1].trim() : null;

  const dateMatch = ocrText.match(/Дата:\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i);
  const dateRaw = dateMatch ? dateMatch[1] : null;

  return { ocrText, amount, counterparty, dateRaw };
}

function stripJsonFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Structured OCR: asks Gemini for strict JSON with line items. Falls back to
 * { items: [] } if parsing fails — caller can still create a scan and let the
 * user add items manually.
 */
export async function ocrReceiptStructured(
  buffer: Buffer,
  mimeType: string,
): Promise<ReceiptOcrStructuredResult> {
  const raw = await callGeminiVision(buffer, mimeType, STRUCTURED_PROMPT);

  let parsed: z.infer<typeof StructuredSchema>;
  try {
    const json = JSON.parse(stripJsonFences(raw));
    parsed = StructuredSchema.parse(json);
  } catch (err) {
    console.warn("[ocrReceiptStructured] JSON parse failed, returning empty items", err);
    return {
      raw,
      parsed: {
        supplier: null,
        documentDate: null,
        totalAmount: null,
        currency: "UAH",
        items: [],
      },
    };
  }

  return {
    raw,
    parsed: {
      supplier: parsed.supplier?.trim() || null,
      documentDate: parseDate(parsed.documentDate ?? null),
      totalAmount: parsed.totalAmount ?? null,
      currency: parsed.currency || "UAH",
      items: parsed.items.map((it) => ({
        name: it.name.trim(),
        quantity: it.quantity,
        unit: (it.unit ?? "шт").trim() || "шт",
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice ?? null,
      })),
    },
  };
}
