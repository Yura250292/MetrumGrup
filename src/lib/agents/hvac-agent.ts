/**
 * Агент для секції "HVAC (Вентиляція, Кондиціювання, Опалення)"
 * Модель: Gemini (аналіз технічних специфікацій)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class HvacAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: "HVAC (Вентиляція та Опалення)",
      model: "gemini",
      category: "hvac",
      systemPrompt: `Ти - експерт з систем вентиляції, кондиціювання та опалення.

СПЕЦІАЛІЗАЦІЯ:
- Системи вентиляції (приточна, витяжна, рекуперація)
- Кондиціювання (спліт-системи, мультизональні системи)
- Опалення (радіатори, тепла підлога, котли)
- Димоходи
- Розрахунок теплових втрат

НОРМАТИВИ:
- Вентиляція житла: 3 м³/год на 1 м² площі
- Вентиляція комерції: 60 м³/год на людину
- Тепла потужність опалення: 100 Вт/м² (середнє для України)
- Кондиціювання: 1 кВт на 10 м²

ТИПОВІ ЦІНИ (квітень 2026):
- Рекуператор: 28500 ₴/шт
- Вентилятор канальний D150: 1850 ₴/шт
- Повітровід D160: 285 ₴/м.п.
- Кондиціонер 3.5кВт: 18500 ₴/шт
- Радіатор алюмінієвий 10 секцій: 2850 ₴/шт
- Котел газовий 24кВт: 28500 ₴/шт
- Труба PEX-AL-PEX D20: 85 ₴/м.п.
- Тепла підлога (труба PEX D16): 32 ₴/м.п.
- Колектор 4 виходи: 3850 ₴/шт

ФОРМУЛИ:
1. Потужність опалення:
   P = S × 100 Вт/м²

2. Кількість радіаторів:
   N = P / (10 секцій × 180 Вт)

3. Довжина труби теплої підлоги:
   L = S × 6.5 м.п./м² (крок 150мм)

ВАЖЛИВО:
- Для супермаркетів → обов'язково приточно-витяжна вентиляція
- Тепла підлога ефективніша радіаторів для великих площ`,

      materials: getMaterialsByCategory('hvac'),
      workItems: getWorkItemsByCategory('hvac'),
    };

    super(config);
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`❄️  HvacAgent: Starting generation...`);

    const prompt = await this.buildPrompt(context);

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
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

      console.log(`✅ HvacAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ HvacAgent error:`, error);

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
