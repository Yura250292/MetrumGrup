import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Завантажити MD інструкцію
async function loadInstructions(): Promise<string> {
  const filePath = path.join(process.cwd(), "src/lib/ESTIMATE_INSTRUCTIONS.md");
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "Використовуй загальні правила перевірки будівельного кошторису: коректність розрахунків, повнота позицій, реалістичність цін, логіка секцій.";
  }
}

export async function POST(request: NextRequest) {
  // 1. Перевірка автентифікації
  const session = await auth();
  if (!session?.user) {
    return unauthorizedResponse();
  }

  try {
    // 2. Отримання даних запиту
    const body = await request.json();
    const { estimateId, estimate } = body;

    // 3. Якщо передано estimateId - завантажити з БД
    let estimateData: any;
    if (estimateId) {
      estimateData = await prisma.estimate.findUnique({
        where: { id: estimateId },
        include: {
          sections: {
            include: {
              items: {
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!estimateData) {
        return NextResponse.json(
          { error: "Кошторис не знайдено" },
          { status: 404 }
        );
      }
    } else if (estimate) {
      estimateData = estimate; // Використати переданий estimate
    } else {
      return NextResponse.json(
        { error: "Потрібен estimateId або estimate" },
        { status: 400 }
      );
    }

    // 4. Завантажити MD інструкцію
    const instructions = await loadInstructions();

    // 5. Створити промпт для верифікації
    const systemPrompt = `Ти - експерт-аудитор будівельних кошторисів з 20-річним досвідом.

Твоє завдання: **детально перевірити кошторис** на коректність розрахунків, реалістичність цін та повноту позицій.

**ІНСТРУКЦІЯ З ПІДРАХУНКУ КОШТОРИСІВ:**

${instructions}

**КРИТЕРІЇ ПЕРЕВІРКИ:**

1. **Коректність розрахунків (CRITICAL):**
   - Перевір формулу кожної позиції: totalCost = (quantity × unitPrice) + laborCost
   - Перевір підсумки секцій: sectionTotal = Σ totalCost всіх позицій
   - Перевір загальні підсумки: totalMaterials, totalLabor, totalOverhead
   - Знайди математичні помилки

2. **Реалістичність цін (WARNING):**
   - Порівняй ціни з діапазонами в інструкції
   - Перевір актуальність цін (2024-2025)
   - Знайди підозріло низькі/високі ціни (±30% від середньої)

3. **Повнота позицій (WARNING):**
   - Перевір чи не пропущені категорії робіт
   - Перевір чи враховані супутні матеріали (клей, кріплення, грунтовка)
   - Перевір чи враховані роботи для кожного матеріалу

4. **Логіка секцій (INFO):**
   - Перевір правильність порядку секцій (17 стандартних категорій)
   - Перевір чи немає дублікатів позицій

5. **Специфікації матеріалів (WARNING):**
   - Перевір наявність конкретних марок (Knauf, Ceresit, Aeroc)
   - Перевір наявність розмірів, ваги, об'єму
   - Перевір посилання на ціни (пошукові URL, не прямі)

**ФОРМАТ ВІДПОВІДІ (JSON):**

{
  "verification": {
    "status": "passed" | "warnings" | "critical",
    "overallScore": 0-100,
    "issues": [
      {
        "severity": "error" | "warning" | "info",
        "category": "calculation" | "pricing" | "completeness" | "logic" | "specifications",
        "sectionIndex": 0,
        "itemIndex": 3,
        "message": "Конкретний опис помилки",
        "suggestion": "Як виправити",
        "expected": "Очікуване значення",
        "actual": "Фактичне значення"
      }
    ],
    "improvements": [
      {
        "type": "add" | "modify" | "remove",
        "sectionIndex": 0,
        "itemIndex": 3,
        "description": "Що потрібно зробити",
        "suggestedChange": {
          "field": "quantity",
          "oldValue": 10,
          "newValue": 11.5,
          "reason": "Запас на підрізку 15%"
        }
      }
    ],
    "summary": "Загальний висновок про якість кошторису (2-3 речення)"
  }
}

**Статуси:**
- "passed" - всі перевірки пройдені, оцінка 85-100
- "warnings" - є попередження, оцінка 60-84
- "critical" - є критичні помилки, оцінка 0-59

**Severity:**
- "error" - критична помилка (неправильний розрахунок, відсутність обов'язкової категорії)
- "warning" - попередження (ціна виходить за діапазон, відсутній супутній матеріал)
- "info" - інформація (рекомендації по оптимізації, порядок секцій)

Аналізуй кошторис детально та об'єктивно. Повертай ТІЛЬКИ JSON без додаткового тексту.`;

    const userPrompt = `Перевір цей кошторис:

\`\`\`json
${JSON.stringify(estimateData, null, 2)}
\`\`\`

Проаналізуй всі позиції, розрахунки, ціни та повноту. Поверни результати у форматі JSON.`;

    // 6. Виклик OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // низька температура для точності
      max_tokens: 8000,
    });

    const resultText = completion.choices[0]?.message?.content || "{}";
    const verificationResult = JSON.parse(resultText);

    // 7. Зберегти результати в БД (якщо estimateId передано)
    if (estimateId) {
      await prisma.estimate.update({
        where: { id: estimateId },
        data: {
          verificationStatus: verificationResult.verification.status,
          verificationResults: verificationResult,
          verificationScore: verificationResult.verification.overallScore,
          verifiedAt: new Date(),
          verifiedBy: "openai",
        },
      });
    }

    // 8. Повернути результат
    return NextResponse.json(verificationResult);
  } catch (error: any) {
    console.error("OpenAI verification error:", error);
    return NextResponse.json({
      verification: {
        status: "unavailable",
        overallScore: null,
        issues: [
          {
            severity: "warning",
            category: "logic",
            message: "Автоматична верифікація тимчасово недоступна",
            suggestion: error.message || "Перевірити конфігурацію OpenAI або повторити пізніше",
          },
        ],
        improvements: [],
        summary: "Кошторис згенеровано, але автоматична верифікація не виконалась.",
      },
    });
  }
}
