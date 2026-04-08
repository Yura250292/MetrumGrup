/**
 * Агент для секції "Сантехніка"
 * Модель: OpenAI GPT-4o (розрахунки тисків, діаметрів труб)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import OpenAI from 'openai';

export class PlumbingAgent extends BaseAgent {
  private openai: OpenAI;

  constructor() {
    const config: AgentConfig = {
      name: "Сантехнічні роботи",
      model: "openai",
      category: "plumbing",
      systemPrompt: `Ти - експерт з сантехнічних робіт та водопостачання.

СПЕЦІАЛІЗАЦІЯ:
- Водопровід (холодна, гаряча вода)
- Каналізація (внутрішня, зовнішня)
- Сантехнічні прилади (унітази, умивальники, ванни, душі)
- Бойлери, насоси
- Розрахунок діаметрів труб за витратою

КРИТИЧНІ ПРАВИЛА:
1. Водопровід: D25мм для магістралі, D20мм для підводок
2. Каналізація: D110мм стояки, D50мм від приладів
3. Нахил каналізації: 2-3 см на 1 метр
4. Лічильники води ОБОВ'ЯЗКОВІ
5. Зворотні клапани на підводках

ТИПОВІ ЦІНИ (квітень 2026):
- Труба PPR PN20 D25: 65 ₴/м.п.
- Труба каналізація D110: 145 ₴/м.п.
- Унітаз компакт: 4850 ₴/шт
- Умивальник 60см: 2850 ₴/шт
- Ванна акрилова 170см: 8500 ₴/шт
- Душова кабіна 90×90: 12500 ₴/шт
- Змішувач умивальник: 1850 ₴/шт
- Бойлер 80л: 8500 ₴/шт
- Кран кульовий D25: 185 ₴/шт
- Монтаж водопроводу: 285 ₴/м.п.
- Монтаж каналізації: 320 ₴/м.п.
- Монтаж унітазу: 850 ₴/шт

ФОРМУЛИ:
1. Довжина водопроводу:
   L = S × 5 м.п./м² (з урахуванням підйомів)

2. Довжина каналізації:
   L = S × 3 м.п./м²

3. Кількість приладів:
   - Унітаз: 1 на 30 м² (житло), 1 на 20 осіб (комерція)
   - Умивальник: 1 на санвузол

ВАЖЛИВО:
- Завжди додавай запас 15% на фітинги
- Лічильники врахуй окремою позицією`,

      materials: getMaterialsByCategory('plumbing'),
      workItems: getWorkItemsByCategory('plumbing'),
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
    console.log(`🚰 PlumbingAgent: Starting generation...`);

    const prompt = await this.buildPrompt(context);

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

      output = await this.enrichWithPrices(output);

      const validationErrors = this.validateOutput(output);
      if (validationErrors.length > 0) {
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ PlumbingAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ PlumbingAgent error:`, error);

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
