/**
 * AI-Interview endpoint для AI-кошторису V2.
 *
 * Альтернатива формальному wizard'у — AI ставить 3-5 динамічних питань
 * на основі базового контексту і повертає структурований wizardData.
 *
 * Два режими:
 *
 *   POST { mode: "questions", context: { objectType?, totalArea?, projectNotes?, hasFiles? } }
 *     → { questions: [{ id, text, hint? }] }
 *
 *   POST { mode: "build", answers: Array<{ question, answer }>, context: {...} }
 *     → { wizardData: WizardData }
 *
 * Не зберігає state — клієнт зберігає список питань-відповідей сам.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const QUESTIONS_PROMPT = `Ти асистент-кошторисник Метрум. Тобі дають базовий контекст проєкту
(тип, площа, нотатки). Запропонуй 3-5 найважливіших питань, відповіді на які
МАКСИМАЛЬНО допоможуть тобі згенерувати точний кошторис.

Питання мають бути:
- Конкретні, без жаргону. Менеджер має зрозуміти.
- Без дублювання того, що вже є у контексті.
- Сфокусовані на параметрах, які реально впливають на ціну/обсяг
  (тип об'єкта, стадія робіт, ключові матеріали/системи, бюджетний клас).

ВИХІД (JSON, без markdown):
{ "questions": [{ "id": "q1", "text": "...", "hint": "..." }] }`;

const BUILD_PROMPT = `Ти асистент-кошторисник Метрум. Тобі дають контекст проєкту і набір
питання-відповідь. Сконструюй структуру wizardData.

Поверни JSON (БЕЗ markdown):
{
  "objectType": "house" | "townhouse" | "apartment" | "office" | "commercial",
  "workScope": "full_cycle" | "renovation" | "finishing" | "reconstruction" | "foundation_only",
  "interiorOnly": boolean,
  "totalArea": "число як string",
  "floors": число,
  "ceilingHeight": "2.7",
  "budgetRange": "economy" | "standard" | "premium" | "luxury",
  "specialRequirements": "усі деталі з відповідей, що не вмістились структурно"
}`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER"];
  if (!allowedRoles.includes(session.user.role)) return forbiddenResponse();

  try {
    const body = await request.json();

    if (body.mode === "questions") {
      const ctx = JSON.stringify(body.context || {}, null, 2);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        systemInstruction: QUESTIONS_PROMPT,
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      });

      const result = await model.generateContent(`Контекст проєкту:\n${ctx}`);
      const raw = result.response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
        parsed = JSON.parse(cleaned);
      }

      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      return NextResponse.json({
        questions: questions.slice(0, 7).map((q: any, i: number) => ({
          id: q.id || `q${i + 1}`,
          text: q.text || q.question || "",
          hint: q.hint || "",
        })),
      });
    }

    if (body.mode === "build") {
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (answers.length === 0) {
        return NextResponse.json({ error: "Немає відповідей" }, { status: 400 });
      }

      const userMsg =
        `Контекст:\n${JSON.stringify(body.context || {}, null, 2)}\n\n` +
        `Питання та відповіді:\n` +
        answers
          .map((a: any, i: number) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`)
          .join("\n");

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        systemInstruction: BUILD_PROMPT,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      });

      const result = await model.generateContent(userMsg);
      const raw = result.response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
        parsed = JSON.parse(cleaned);
      }

      const wizardData = {
        objectType: parsed.objectType || body.context?.objectType || "apartment",
        workScope: parsed.workScope || "renovation",
        totalArea: parsed.totalArea ?? body.context?.totalArea ?? "",
        floors: typeof parsed.floors === "number" ? parsed.floors : 1,
        ceilingHeight: parsed.ceilingHeight || "2.7",
        budgetRange: parsed.budgetRange || "standard",
        specialRequirements: parsed.specialRequirements || "",
      };

      return NextResponse.json({
        wizardData,
        interiorOnly: parsed.interiorOnly !== false,
      });
    }

    return NextResponse.json({ error: "Невідомий mode" }, { status: 400 });
  } catch (err: any) {
    console.error("interview failed:", err);
    return NextResponse.json(
      { error: err?.message || "AI-interview помилка" },
      { status: 500 }
    );
  }
}
