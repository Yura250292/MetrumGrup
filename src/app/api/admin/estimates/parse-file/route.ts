import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseExcelEstimate } from "@/lib/parsers/excel-estimate-parser";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

const ESTIMATE_OCR_PROMPT = `Це кошторис (будівельний/ремонтний). Витягни ВСІ позиції з таблиці.

Верни ТІЛЬКИ JSON (без тексту навколо) у такому форматі:
{
  "items": [
    {
      "description": "Назва роботи або матеріалу",
      "unit": "м2 | шт | м | м.п. | т | пог.м | компл.",
      "quantity": 10.5,
      "unitPrice": 250.00,
      "totalPrice": 2625.00,
      "category": "Демонтаж | Фундамент | Стіни | Покрівля | Електрика | Сантехніка | Опалення | Оздоблення | Матеріали | Роботи | null"
    }
  ],
  "totalAmount": 125000.50,
  "currency": "UAH"
}

Правила:
- description: повна назва, навіть якщо довга
- unit: одиниця виміру
- quantity: кількість (число, може бути дробове)
- unitPrice: ціна за одиницю (число в грн)
- totalPrice: quantity * unitPrice (якщо в таблиці є окрема колонка суми — бери звідти)
- Якщо якогось поля немає — використовуй 0 або null
- Суми українського формату "25 500,50" перетворюй на 25500.50
- Ігноруй заголовки розділів (рядки без цін)
- Ігноруй підсумкові рядки "Разом", "Всього" — їх значення йде в totalAmount
- Якщо в кошторисі є колонка для загальної суми — просумуй усі рядки для totalAmount`;

type ParsedItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string | null;
};

type ParseResponse = {
  items: ParsedItem[];
  totalAmount: number;
  currency: string;
  metadata: {
    totalRows: number;
    parsedRows: number;
    skippedRows: number;
    method: "excel" | "gemini-pdf" | "gemini-image";
    model?: string;
  };
  warnings: string[];
};

function parseAmount(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;

  let cleaned = String(raw).replace(/[^\d\s,.]/g, "").trim();
  if (!cleaned) return 0;
  cleaned = cleaned.replace(/\s/g, "");

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const afterComma = cleaned.length - 1 - lastComma;
    if (afterComma === 1 || afterComma === 2) {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const afterDot = cleaned.length - 1 - lastDot;
    if (afterDot !== 1 && afterDot !== 2) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function parseCsvWithGemini(
  csvText: string,
): Promise<{ items: ParsedItem[]; totalAmount: number; model: string }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не налаштовано");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const truncated = csvText.length > 50000 ? csvText.slice(0, 50000) + "\n[...truncated]" : csvText;

  const prompt = `${ESTIMATE_OCR_PROMPT}

Нижче — дані з Excel у форматі CSV. Першими кілька рядків можуть бути заголовками компанії, проєкту тощо. Далі йде таблиця з позиціями. Витягни всі позиції:

${truncated}`;

  let lastError: unknown = null;
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Gemini не повернув JSON");
      const parsed = JSON.parse(jsonMatch[0]);

      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const items: ParsedItem[] = rawItems
        .map((raw: any) => {
          const quantity = parseAmount(raw.quantity);
          const unitPrice = parseAmount(raw.unitPrice);
          let totalPrice = parseAmount(raw.totalPrice);
          if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;
          return {
            description: String(raw.description ?? "").trim(),
            unit: String(raw.unit ?? "").trim() || "шт",
            quantity,
            unitPrice,
            totalPrice,
            category: raw.category && typeof raw.category === "string" ? raw.category : null,
          };
        })
        .filter((item: ParsedItem) => item.description && (item.totalPrice > 0 || item.unitPrice > 0));

      const totalAmount =
        parseAmount(parsed.totalAmount) ||
        items.reduce((sum: number, i: ParsedItem) => sum + i.totalPrice, 0);

      return { items, totalAmount, model: modelName };
    } catch (err) {
      lastError = err;
      console.error(`[parse-file] CSV/${modelName} failed:`, err instanceof Error ? err.message : err);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Всі моделі Gemini недоступні");
}

async function parseWithGemini(
  buffer: Buffer,
  mimeType: string,
): Promise<{ items: ParsedItem[]; totalAmount: number; model: string }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не налаштовано");
  }

  const base64 = buffer.toString("base64");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  let lastError: unknown = null;
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64 } },
        { text: ESTIMATE_OCR_PROMPT },
      ]);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Gemini не повернув JSON");
      const parsed = JSON.parse(jsonMatch[0]);

      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const items: ParsedItem[] = rawItems
        .map((raw: any) => {
          const quantity = parseAmount(raw.quantity);
          const unitPrice = parseAmount(raw.unitPrice);
          let totalPrice = parseAmount(raw.totalPrice);
          if (!totalPrice && quantity && unitPrice) {
            totalPrice = quantity * unitPrice;
          }
          return {
            description: String(raw.description ?? "").trim(),
            unit: String(raw.unit ?? "").trim() || "шт",
            quantity,
            unitPrice,
            totalPrice,
            category: raw.category && typeof raw.category === "string" ? raw.category : null,
          };
        })
        .filter((item: ParsedItem) => item.description && (item.totalPrice > 0 || item.unitPrice > 0));

      const totalAmount =
        parseAmount(parsed.totalAmount) ||
        items.reduce((sum: number, i: ParsedItem) => sum + i.totalPrice, 0);

      return { items, totalAmount, model: modelName };
    } catch (err) {
      lastError = err;
      console.error(`[parse-file] ${modelName} failed:`, err instanceof Error ? err.message : err);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Всі моделі Gemini недоступні");
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ALLOWED_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл завеликий (макс 20 МБ)" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const mime = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());
    const warnings: string[] = [];

    // Excel — try native parser first, fallback to Gemini CSV parsing
    if (
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel"
    ) {
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      const result = await parseExcelEstimate(arrayBuffer);

      let items: ParsedItem[] = result.items.map((it) => ({
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        category: it.category ?? null,
      }));
      let totalAmount = result.totalAmount;
      let method: ParseResponse["metadata"]["method"] = "excel";
      let model: string | undefined;

      if (!result.success) {
        warnings.push(...result.errors);
      }

      // Fallback: if native parser found nothing — convert to CSV and use Gemini
      if (items.length === 0) {
        warnings.push("Native парсер не знайшов позицій — використано AI");
        try {
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (firstSheet) {
            const csvText = XLSX.utils.sheet_to_csv(firstSheet, { FS: ";", blankrows: false });
            const ai = await parseCsvWithGemini(csvText);
            items = ai.items;
            totalAmount = ai.totalAmount;
            method = "gemini-pdf"; // reuse label for AI fallback
            model = ai.model;
          }
        } catch (fallbackErr) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          warnings.push(`AI fallback не спрацював: ${msg}`);
        }
      }

      const response: ParseResponse = {
        items,
        totalAmount,
        currency: "UAH",
        metadata: {
          totalRows: result.metadata.totalRows,
          parsedRows: items.length,
          skippedRows: Math.max(0, result.metadata.totalRows - items.length),
          method,
          model,
        },
        warnings,
      };
      return NextResponse.json(response);
    }

    // PDF
    if (name.endsWith(".pdf") || mime === "application/pdf") {
      const { items, totalAmount, model } = await parseWithGemini(buffer, "application/pdf");
      const response: ParseResponse = {
        items,
        totalAmount,
        currency: "UAH",
        metadata: {
          totalRows: items.length,
          parsedRows: items.length,
          skippedRows: 0,
          method: "gemini-pdf",
          model,
        },
        warnings,
      };
      return NextResponse.json(response);
    }

    // Images
    if (
      mime === "image/jpeg" ||
      mime === "image/png" ||
      mime === "image/webp" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp")
    ) {
      const { items, totalAmount, model } = await parseWithGemini(buffer, mime || "image/jpeg");
      const response: ParseResponse = {
        items,
        totalAmount,
        currency: "UAH",
        metadata: {
          totalRows: items.length,
          parsedRows: items.length,
          skippedRows: 0,
          method: "gemini-image",
          model,
        },
        warnings,
      };
      return NextResponse.json(response);
    }

    return NextResponse.json(
      { error: "Непідтримуваний формат. Використовуйте Excel, PDF, JPG, PNG або WebP." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[estimates/parse-file] error:", error);
    const msg = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
