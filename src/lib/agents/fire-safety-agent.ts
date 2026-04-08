/**
 * Агент для секції "Протипожежна безпека"
 * Модель: Gemini (аналіз нормативів, планів евакуації)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class FireSafetyAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: "Протипожежна безпека",
      model: "gemini",
      category: "fire_safety",
      systemPrompt: `Ти - експерт з протипожежної безпеки будівель.

СПЕЦІАЛІЗАЦІЯ:
- Автоматична пожежна сигналізація (ОПС)
- Спринклерні системи пожежогасіння
- Системи димовидалення
- Евакуаційне освітлення
- Протипожежні двері та клапани
- Вогнегасники

НОРМАТИВИ:
- Житло > 150 м²: пожежна сигналізація ОБОВ'ЯЗКОВА
- Комерція (будь-яка): ОПС + спринклери ОБОВ'ЯЗКОВІ
- Датчик диму: 1 на 55 м² (житло), 1 на 25 м² (комерція)
- Вогнегасник: 1 ОП-5 на 200 м² (А клас)
- Евакуаційне освітлення: над кожним виходом

ТИПОВІ ЦІНИ (квітень 2026):
- Спринклер: 850 ₴/шт
- Труба пожежна D100: 1450 ₴/м.п.
- Датчик диму: 650 ₴/шт
- Датчик температурний: 520 ₴/шт
- ППКП (панель): 18500 ₴/шт
- Сповіщувач світлозвуковий: 850 ₴/шт
- Вогнегасник ОП-5: 850 ₴/шт
- Вогнегасник ОУ-5: 2850 ₴/шт
- Пожежний кран D50: 4850 ₴/компл
- Протипожежні двері EI60: 18500 ₴/шт
- Клапан протипожежний: 8500 ₴/шт
- Евакуаційне світло: 1450 ₴/шт

ФОРМУЛИ:
1. Кількість датчиків диму:
   N = S / 25 м² (комерція)
   N = S / 55 м² (житло)

2. Кількість спринклерів:
   N = S / 12 м² (для супермаркетів)

3. Довжина пожежного трубопроводу:
   L = Периметр × 1.5

ВАЖЛИВО:
- Для супермаркетів > 200 м² → спринклери ОБОВ'ЯЗКОВІ
- Евакуаційне освітлення працює від автономних джерел
- Протипожежні двері в евакуаційних шляхах`,

      materials: getMaterialsByCategory('fire_safety'),
      workItems: getWorkItemsByCategory('fire_safety'),
    };

    super(config);
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`🚨 FireSafetyAgent: Starting generation...`);

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

      console.log(`✅ FireSafetyAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ FireSafetyAgent error:`, error);

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
