import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const body = await request.json();
    const { estimate, engineerPrompt, model = "openai" } = body;

    if (!estimate || !engineerPrompt) {
      return NextResponse.json(
        { error: "Необхідно надати кошторис та промпт для редагування" },
        { status: 400 }
      );
    }

    // Перевірити наявність API ключа для обраної моделі
    if (model === "openai" && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "")) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не налаштований" },
        { status: 500 }
      );
    }
    if (model === "gemini" && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "")) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY не налаштований" },
        { status: 500 }
      );
    }
    if (model === "anthropic" && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "")) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY не налаштований" },
        { status: 500 }
      );
    }

    // Підготувати поточний кошторис у форматі для AI
    const currentEstimateText = JSON.stringify(estimate, null, 2);

    // Системний промпт (однаковий для всіх моделей)
    const systemPrompt = `Ти - досвідчений інженер-кошторисник будівельної компанії Metrum Group.
Твоє завдання - внести правки в існуючий кошторис на основі вказівок інженера.

ВАЖЛИВІ ПРАВИЛА:
1. Зберігай структуру JSON точно як в оригіналі
2. Всі ціни (unitPrice, laborCost) повинні бути ЧИСЛАМИ (number), НЕ строками
3. Всі кількості (quantity) повинні бути ЧИСЛАМИ (number)
4. НЕ використовуй кому як десятковий роздільник (45,5 ✗ → 45.5 ✓)
5. Додавай конкретні назви матеріалів з марками та виробниками
6. Перераховуй totalCost, sectionTotal та summary після змін
7. Якщо додаєш нові позиції - вказуй реальні ціни з українських магазинів
8. Якщо видаляєш позиції - пояснюй чому в recommendations

ФОРМУЛИ ДЛЯ РОЗРАХУНКУ:
- totalCost (позиції) = quantity × unitPrice + laborCost
- sectionTotal = сума totalCost всіх позицій у секції
- materialsCost = сума (quantity × unitPrice) по всіх позиціях
- laborCost (загальний) = сума laborCost по всіх позиціях
- overheadCost = (materialsCost + laborCost) × overheadPercent / 100
- totalBeforeDiscount = materialsCost + laborCost + overheadCost

Поверни ТІЛЬКИ JSON (без додаткового тексту), точно такої ж структури як в оригіналі.`;

    const userPrompt = `ПОТОЧНИЙ КОШТОРИС:
${currentEstimateText}

ВКАЗІВКИ ІНЖЕНЕРА:
${engineerPrompt}

Внеси необхідні зміни в кошторис відповідно до вказівок інженера. Поверни оновлений кошторис у форматі JSON.`;

    let responseText = "";

    console.log(`🤖 Викликаємо ${model} для редагування кошторису...`);
    console.log(`📝 Інженер просить: "${engineerPrompt.substring(0, 100)}..."`);

    // Викликати відповідну AI модель
    if (model === "openai") {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Lower for consistency (was 0.3)
        max_tokens: 8000,
        response_format: { type: "json_object" },
      });
      responseText = completion.choices[0]?.message?.content || "";

      // OpenAI може повернути JSON в markdown блоці навіть з json_object форматом
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1].trim();
      }
    } else if (model === "gemini") {
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
      });

      const result = await geminiModel.generateContent([
        systemPrompt,
        userPrompt,
      ]);
      responseText = result.response.text();

      // Gemini може повернути JSON в markdown блоці
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1].trim();
      }
    } else if (model === "anthropic") {
      const message = await anthropic.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 8000,
        temperature: 0.1, // Lower for consistency (was 0.3)
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
        ],
      });

      const content = message.content[0];
      if (content.type === "text") {
        responseText = content.text;
      }

      // Claude може повернути JSON в markdown блоці
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1].trim();
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: `${model} не повернув відповідь` },
        { status: 500 }
      );
    }

    // Очистити текст перед парсингом
    responseText = responseText.trim();

    // Спроба видалити можливі додаткові markdown блоки якщо пропустили раніше
    if (responseText.startsWith('```')) {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1].trim();
      }
    }

    // Парсити JSON відповідь
    let refinedEstimate;
    try {
      refinedEstimate = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ Помилка парсингу JSON від ${model}:`, parseError);
      console.error(`📄 Raw response (перші 500 символів):`, responseText.substring(0, 500));
      return NextResponse.json(
        {
          error: `${model} повернув невалідний JSON`,
          details: parseError instanceof Error ? parseError.message : 'Unknown error',
          rawResponse: responseText.substring(0, 1000), // Обмежити для читабельності
        },
        { status: 422 }
      );
    }

    // Перевірити що структура збережена
    if (!refinedEstimate.sections || !Array.isArray(refinedEstimate.sections)) {
      return NextResponse.json(
        {
          error: `${model} повернув кошторис без секцій`,
          data: refinedEstimate,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      estimate: refinedEstimate,
      message: `Кошторис успішно відредаговано через ${model === "openai" ? "GPT-4o" : model === "gemini" ? "Gemini" : "Claude"}`,
      model,
    });

  } catch (error) {
    console.error("Помилка редагування кошторису:", error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          error: `OpenAI API помилка: ${error.message}`,
          status: error.status,
        },
        { status: error.status || 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Помилка: ${message}` },
      { status: 500 }
    );
  }
}
