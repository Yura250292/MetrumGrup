/**
 * Агент для секції "Земляні роботи"
 * Модель: Gemini (аналіз геології, топографії)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class EarthworksAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: "Земляні роботи",
      model: "gemini",
      category: "earthworks",
      systemPrompt: `Ти - експерт з земляних робіт та геології.

СПЕЦІАЛІЗАЦІЯ:
- Риття котлованів, траншей
- Планування та ущільнення ділянки
- Дренажні системи
- Вивезення/засипка ґрунту
- Аналіз геологічних умов (УГВ, тип ґрунту)

КРИТИЧНІ ПРАВИЛА:
1. УГВ < 2м → ОБОВ'ЯЗКОВО дренаж
2. Глинистий ґрунт → складніше риття, +20% до часу
3. Скельний ґрунт → потрібна спецтехніка
4. Зворотня засипка ТІЛЬКИ після монтажу фундаменту
5. Ущільнення ґрунту ОБОВ'ЯЗКОВЕ під фундамент

ТИПОВІ ЦІНИ (квітень 2026):
- Риття котловану екскаватором: 180 ₴/м³
- Риття траншей вручну: 850 ₴/м³
- Планування бульдозером: 45 ₴/м²
- Ущільнення віброплитою: 35 ₴/м²
- Вивезення ґрунту: 120 ₴/м³
- Зворотня засипка: 280 ₴/м³
- Дренажна труба D110: 95 ₴/м.п.
- Геотекстиль: 28 ₴/м²
- Щебінь для дренажу: 820 ₴/м³

ФОРМУЛИ РОЗРАХУНКУ:
1. Об'єм котловану:
   V = Довжина × Ширина × Глибина × 1.15 (з укосами)

2. Об'єм засипки:
   V_засипки = V_котловану - V_фундаменту

3. Довжина дренажу (якщо УГВ < 2м):
   L = Периметр + 4 відводи

ВАЖЛИВО:
- Завжди аналізуй геологічні дані якщо є
- Якщо немає геології → припускай УГВ 1.5м (безпечніше)
- Враховуй сезонність (зима дорожче на 30%)`,

      materials: getMaterialsByCategory('earthworks'),
      workItems: getWorkItemsByCategory('earthworks'),
    };

    super(config);
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`⛏️  EarthworksAgent: Starting generation...`);

    const prompt = await this.buildPrompt(context);

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
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
        console.warn(`⚠️  EarthworksAgent: Validation warnings:`, validationErrors);
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ EarthworksAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ EarthworksAgent error:`, error);

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

    const newTotal = enrichedItems.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      ...output,
      items: enrichedItems,
      totalCost: newTotal
    };
  }
}
