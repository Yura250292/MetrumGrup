import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const OCR_PROMPT = `Розпізнай цей чек/накладну/рахунок. Витягни структуровану інформацію українською мовою:

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

const MODELS_TO_TRY = ["gemini-3-flash-preview", "gemini-2.5-flash"];

/**
 * Parse amount from Ukrainian/European text format.
 * Handles "23 121,12" (UA), "23,121.12" (EN), "23121.12", "23121,12".
 */
function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d\s,.]/g, "").trim();
  if (!cleaned) return null;
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
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ALLOWED_ROLES.includes(session.user.role)) return forbiddenResponse();

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY не налаштовано на сервері" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Підтримуються JPG, PNG, WebP або PDF" },
        { status: 400 }
      );
    }

    // 20 MB limit (Gemini inline data limit)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл завеликий (макс 20 МБ)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    let ocrText: string | null = null;
    let lastError: unknown = null;

    for (const modelName of MODELS_TO_TRY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          { inlineData: { mimeType: file.type, data: base64 } },
          { text: OCR_PROMPT },
        ]);
        ocrText = result.response.text();
        break;
      } catch (err) {
        lastError = err;
        console.error(`[financing/ocr] ${modelName} failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (!ocrText) {
      const msg = lastError instanceof Error ? lastError.message : "Усі моделі Gemini недоступні";
      return NextResponse.json({ error: `AI розпізнавання недоступне: ${msg}` }, { status: 502 });
    }

    // Extract structured fields
    const amountMatch = ocrText.match(/Сума:\s*([\d\s,.]+)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;

    const supplierMatch = ocrText.match(/Постачальник:\s*(.+?)(?:\n|$)/i);
    const counterparty = supplierMatch ? supplierMatch[1].trim() : null;

    const dateMatch = ocrText.match(/Дата:\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i);
    const dateRaw = dateMatch ? dateMatch[1] : null;

    return NextResponse.json({
      ocrText,
      amount,
      counterparty,
      dateRaw,
    });
  } catch (error) {
    console.error("[financing/ocr] error:", error);
    const msg = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
