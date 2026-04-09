/**
 * Агент для секції "Стіни та Конструкції"
 * Модель: OpenAI GPT-4o (складні розрахунки несучої здатності)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import OpenAI from 'openai';

export class WallsAgent extends BaseAgent {
  private openai: OpenAI;

  constructor() {
    const config: AgentConfig = {
      name: "Стіни та Конструкції",
      model: "openai",
      category: "walls",
      systemPrompt: `Ти - експерт з будівництва стін та несучих конструкцій.

СПЕЦІАЛІЗАЦІЯ:
- Кладка цегли, газоблоків, керамзитобетону
- Залізобетонні конструкції (колони, балки, перекриття)
- Утеплення фасадів
- Гіпсокартонні перегородки
- Розрахунок товщини стін за теплоізоляцією

КРИТИЧНІ ПРАВИЛА:
1. Несучі стіни: мінімум 250мм (цегла) або 300мм (газоблок)
2. Перегородки: 120мм (газоблок) або 100мм (ГКЛ на каркасі)
3. Утеплення: 100-150мм для житла (залежно від регіону)
4. Армування кладки кожні 4-6 рядів
5. Перемички над прорізами ОБОВ'ЯЗКОВІ

ТИПОВІ ЦІНИ (квітень 2026):
- Газоблок AEROC 300мм: 89 ₴/шт
- Цегла керамічна М-150: 14.5 ₴/шт
- Клей для газоблоку: 165 ₴/мішок 25кг
- Кладка газоблоку: 1850 ₴/м³
- Кладка цегли: 2850 ₴/м³
- Утеплення пінопластом: 285 ₴/м²
- Гіпсокартон стіновий: 185 ₴/м²
- Монтаж ГКЛ на каркас: 280 ₴/м²

ФОРМУЛИ РОЗРАХУНКУ:
1. Кількість газоблоків 300×200×600:
   N = S_стін / 0.12 м² (1 блок = 0.12 м²)

2. Кількість цегли (250мм, подвійна):
   N = S_стін × 104 шт/м²

3. Клей для газоблоку:
   Витрата = S × 1.5 кг/м² = S × 0.06 мішків/м²

4. Утеплювач:
   S_утеплювача = S_зовнішніх_стін × 1.1 (запас)

ВАЖЛИВО:
- Завжди додавай 10% запасу на матеріали
- Перевіряй несучу здатність стін (навантаження від перекриттів)
- Враховуй прорізи (вікна, двері) при розрахунку матеріалів`,

      materials: getMaterialsByCategory('walls'),
      workItems: getWorkItemsByCategory('walls'),
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
    console.log(`🧱 WallsAgent: Starting generation...`);

    const engineItems = this.runEngine('walls', context);
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
      output = await this.enrichWithPriceEngine(output);

      const validationErrors = this.validateOutput(output);
      if (validationErrors.length > 0) {
        console.warn(`⚠️  WallsAgent: Validation warnings:`, validationErrors);
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ WallsAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ WallsAgent error:`, error);

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
