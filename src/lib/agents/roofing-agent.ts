/**
 * Агент для секції "Покрівля"
 * Модель: Gemini (аналіз планів, фото)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class RoofingAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: "Покрівля",
      model: "gemini",
      category: "roofing",
      systemPrompt: `Ти - експерт з покрівельних робіт.

СПЕЦІАЛІЗАЦІЯ:
- Стропильна система (дерев'яна, металева)
- Покрівельні матеріали (металочерепиця, профнастил, гнучка черепиця)
- Утеплення покрівлі
- Гідро- та пароізоляція
- Водостічні системи
- Зенітні ліхтарі (для промислових об'єктів)

КРИТИЧНІ ПРАВИЛА:
1. Кут нахилу > 12° для металочерепиці, > 5° для профнастилу
2. Утеплення 200мм для житла, 150мм для комерції
3. Гідробар'єр ОБОВ'ЯЗКОВИЙ між утеплювачем та покрівлею
4. Паробар'єр під утеплювачем
5. Водостік: 1 труба D100 на 80-100 м² покрівлі

ТИПОВІ ЦІНИ (квітень 2026):
- Металочерепиця 0.45мм: 385 ₴/м²
- Профнастил Н-75: 580 ₴/м²
- Гнучка черепиця: 480 ₴/м²
- Мінвата 200мм: 650 ₴/м²
- Гідробар'єр: 32 ₴/м²
- Паробар'єр: 18 ₴/м²
- Водостік (ринва+труба): 285 ₴/м.п.
- OSB-3 12мм: 420 ₴/м²
- Монтаж металочерепиці: 380 ₴/м²

ФОРМУЛИ РОЗРАХУНКУ:
1. Площа покрівлі:
   S = S_проекції / cos(кут_нахилу)
   Приклад: 100м² / cos(30°) = 115 м²

2. Довжина водостоку:
   L_ринв = Периметр_даху
   L_труб = Кількість_труб × Висота_будинку

3. Утеплювач:
   S_утеплювача = S_покрівлі × 1.1

ВАЖЛИВО:
- Враховуй складність даху (вальми, ендови → +20% до матеріалів)
- Для плоскої покрівлі → інша технологія`,

      materials: getMaterialsByCategory('roofing'),
      workItems: getWorkItemsByCategory('roofing'),
    };

    super(config);
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`🏠 RoofingAgent: Starting generation...`);

    const prompt = await this.buildPrompt(context);

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8000,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      let output: AgentOutput = JSON.parse(responseText);

      output = await this.enrichWithPrices(output);

      const validationErrors = this.validateOutput(output);
      if (validationErrors.length > 0) {
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ RoofingAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ RoofingAgent error:`, error);

      return {
        sectionTitle: this.config.name,
        items: [],
        totalCost: 0,
        warnings: [`Помилка: ${error instanceof Error ? error.message : 'Unknown'}`]
      };
    }
  }

  private async enrichWithPrices(output: AgentOutput): Promise<AgentOutput> {
    const enrichedItems = [];

    for (const item of output.items) {
      let enrichedItem = { ...item };

      if (!item.priceSource || item.confidence < 0.7) {
        const priceResult = await this.searchPrice(item.description, item.unit);

        if (priceResult.confidence > item.confidence) {
          enrichedItem.unitPrice = priceResult.price;
          enrichedItem.priceSource = priceResult.source;
          enrichedItem.confidence = priceResult.confidence;
          enrichedItem.totalCost = enrichedItem.quantity * enrichedItem.unitPrice + enrichedItem.laborCost;
        }
      }

      enrichedItems.push(enrichedItem);
    }

    return {
      ...output,
      items: enrichedItems,
      totalCost: enrichedItems.reduce((sum, item) => sum + item.totalCost, 0)
    };
  }
}
