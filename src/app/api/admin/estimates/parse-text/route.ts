/**
 * POST /api/admin/estimates/parse-text
 *
 * Free-text mode для AI-кошторису V2. Користувач описує проєкт своїми
 * словами (textarea), AI парсить у структуру wizardData. Альтернатива
 * формальному 11-кроковому wizard'у.
 *
 * Запит:  { text: string }
 * Відповідь: { wizardData: WizardData, confidence: 'high'|'medium'|'low', notes: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `Ти асистент-кошторисник Метрум. Користувач описує проєкт вільним текстом.
Твоя задача — витягти структуровані параметри для генерації кошторису.

Поверни JSON у такому форматі (БЕЗ markdown wrapping):
{
  "objectType": "house" | "townhouse" | "apartment" | "office" | "commercial",
  "workScope": "full_cycle" | "renovation" | "finishing" | "reconstruction" | "foundation_only" | "foundation_walls" | "foundation_walls_roof",
  "interiorOnly": boolean,  // true якщо лише оздоблення/внутрішні роботи
  "totalArea": "число у м² як string",
  "floors": число,
  "ceilingHeight": "2.7" | "3.0" | etc,
  "budgetRange": "economy" | "standard" | "premium" | "luxury",
  "region": "Київ | Львів | ..." | null,
  "specialRequirements": "вільний текст з усіма деталями, які не вмістились у структуру",
  "confidence": "high" | "medium" | "low",
  "notes": "Коротко: що зрозумів з тексту, чого не вистачає"
}

Правила:
- Якщо текст коротенький ("ремонт квартири") → confidence: "low", запиши все що знаєш у specialRequirements
- Якщо клієнт каже "будівництво з нуля" / "забудова" / "новобудова" → interiorOnly: false
- Якщо клієнт каже "ремонт" / "оздоблення" / "косметичний" → interiorOnly: true, workScope: "renovation" або "finishing"
- Якщо площа не вказана → totalArea: "" (порожній string)
- Якщо клієнт каже "елітний" / "люкс" → budgetRange: "luxury", "дорого" → "premium", "бюджетно" → "economy"
- Будь-які деталі (матеріали, побажання, особливості, дедлайни, обмеження) → у specialRequirements`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const body = (await request.json()) as { text?: string };
    const text = (body.text || "").trim();
    if (!text || text.length < 5) {
      return NextResponse.json(
        { error: "Опис проєкту занадто короткий" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(text);
    const raw = result.response.text();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Stripping ```json``` fallback
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    // Минімально валідуємо
    const wizardData = {
      objectType: parsed.objectType || "apartment",
      workScope: parsed.workScope || "renovation",
      totalArea: parsed.totalArea ?? "",
      floors: typeof parsed.floors === "number" ? parsed.floors : 1,
      ceilingHeight: parsed.ceilingHeight || "2.7",
      budgetRange: parsed.budgetRange || "standard",
      specialRequirements: parsed.specialRequirements || text,
    };

    return NextResponse.json({
      wizardData,
      interiorOnly: parsed.interiorOnly !== false,
      region: parsed.region || null,
      confidence: parsed.confidence || "medium",
      notes: parsed.notes || "",
    });
  } catch (err: any) {
    console.error("parse-text failed:", err);
    return NextResponse.json(
      { error: err?.message || "Не вдалось розпарсити текст" },
      { status: 500 }
    );
  }
}
