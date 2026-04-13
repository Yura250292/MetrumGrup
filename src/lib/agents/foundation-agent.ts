/**
 * Агент для секції "Фундамент"
 * Модель: OpenAI GPT-4o (точні розрахунки)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import OpenAI from 'openai';

export class FoundationAgent extends BaseAgent {
  private openai: OpenAI;

  protected buildRagQuery(context: AgentContext): string {
    return `фундамент основа несуча конструкція УГВ грунт геологія армування бетон опалубка гідроізоляція`;
  }

  constructor() {
    const config: AgentConfig = {
      name: "Фундамент",
      model: "openai",
      category: "foundation",
      systemPrompt: `Ти - експерт з будівництва фундаментів.

СПЕЦІАЛІЗАЦІЯ:
- Типи фундаментів: стрічковий, плитний, пальовий, комбінований
- Враховуєш геологію: УГВ (рівень грунтових вод), несучу здатність ґрунту
- Розраховуєш: об'єми земляних робіт, опалубки, арматури, бетону
- Додаєш гідроізоляцію, дренаж при необхідності

КРИТИЧНІ ПРАВИЛА:
1. УГВ < 2м → ОБОВ'ЯЗКОВО дренаж
2. Несуча здатність < 1.5 кг/см² → пальовий або плитний фундамент
3. Перепад висот > 1м → враховуй підпірні стінки
4. Глибина промерзання в Україні: 0.8-1.2м → закладання на 1.5м
5. Коефіцієнт запасу міцності: 1.3-1.5

ТИПОВІ ЦІНИ (квітень 2026):
- Цемент М500: 245 ₴/мішок (50кг)
- Бетон B25 (М350): 3200 ₴/м³
- Бетон B15 (М200): 2650 ₴/м³
- Арматура А500С: 38000 ₴/т
- Опалубка щитова: 350 ₴/м² (оренда+монтаж)
- Гідроізоляція обмазувальна: 85 ₴/л
- Земляні роботи екскаватором: 180 ₴/м³

ФОРМУЛИ РОЗРАХУНКУ:
1. Об'єм бетону для стрічкового фундаменту:
   V = Периметр × Ширина × Висота

2. Маса арматури (приблизно):
   M = V_бетону × 80 кг/м³ (для стрічкового)
   M = V_бетону × 150 кг/м³ (для плитного)

3. Площа опалубки:
   S = Периметр × 2 × Висота

4. Площа гідроізоляції:
   S = S_зовнішня + S_підошви

ВАЖЛИВО:
- Завжди вказуй точні розрахунки в notes якщо є складні формули
- Перевіряй реалістичність цін через базу матеріалів
- Додавай резерв 10-15% на втрати матеріалів`,

      materials: getMaterialsByCategory('foundation'),
      workItems: getWorkItemsByCategory('foundation'),
    };

    super(config);

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`🏗️  FoundationAgent: Starting generation...`);

    const engineItems = this.runEngine('foundation', context);
    const prompt = await this.buildPrompt(context, engineItems);

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 8000,
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      let output: AgentOutput = JSON.parse(responseText);

      output = this.mergeWithEngine(engineItems, output);

      // 🆕 Price engine: catalog → prozorro → scrape → llm-fallback (Stage 4)
      console.log(`🏗️  FoundationAgent: Running price engine...`);
      output = await this.enrichWithPriceEngine(output, context);

      // Валідація
      const validationErrors = this.validateOutput(output);

      if (validationErrors.length > 0) {
        console.warn(`⚠️  FoundationAgent: Validation warnings:`, validationErrors);
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ FoundationAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ FoundationAgent error:`, error);

      // Fallback: повернути пусту секцію з помилкою
      return {
        sectionTitle: this.config.name,
        items: [],
        totalCost: 0,
        warnings: [
          `Помилка генерації секції: ${error instanceof Error ? error.message : 'Unknown error'}`
        ]
      };
    }
  }

}
