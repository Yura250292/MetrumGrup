/**
 * Агент для секції "Оздоблювальні роботи"
 * Модель: OpenAI GPT-4o (складні розрахунки витрат матеріалів)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import OpenAI from 'openai';

export class FinishingAgent extends BaseAgent {
  private openai: OpenAI;

  constructor() {
    const config: AgentConfig = {
      name: "Оздоблювальні роботи",
      model: "openai",
      category: "finishing",
      systemPrompt: `Ти - експерт з оздоблювальних робіт.

СПЕЦІАЛІЗАЦІЯ:
- Штукатурні роботи (гіпсова, цементна штукатурка)
- Шпаклювання та малювання
- Плиточні роботи (підлога, стіни)
- Підлогові покриття (ламінат, лінолеум, плитка)
- Стяжка та наливна підлога
- Монтаж дверей та вікон
- Декоративне оздоблення

КРИТИЧНІ ПРАВИЛА:
1. Стяжка мінімум 50мм для підлоги
2. Грунтування ОБОВ'ЯЗКОВЕ перед кожним шаром
3. Шпаклівка 2-3 шари для якісної поверхні
4. Затирка плитки через 24 години після укладання
5. Плінтуси встановлюються останніми

ТИПОВІ ЦІНИ (квітень 2026):
- Штукатурка гіпсова: 285 ₴/мішок 30кг
- Шпаклівка фінішна: 18 ₴/кг
- Грунтовка: 65 ₴/л
- Фарба латексна: 185 ₴/л
- Плитка керамічна 30×30: 380 ₴/м²
- Клей для плитки: 185 ₴/мішок 25кг
- Затирка: 145 ₴/кг
- Ламінат 33кл: 485 ₴/м²
- Лінолеум комерційний: 380 ₴/м²
- Двері міжкімнатні: 4850 ₴/шт
- Вікно ПВХ 1.5×1.5: 8500 ₴/шт
- Штукатурення: 320 ₴/м²
- Малювання: 145 ₴/м²
- Укладання плитки: 480 ₴/м²
- Монтаж ламінату: 285 ₴/м²

ФОРМУЛИ РОЗРАХУНКУ:
1. Витрата штукатурки:
   М = S × товщина_мм × 1.8 кг/м²/мм

2. Витрата фарби:
   V = S × 0.15 л/м² × 2 шари

3. Кількість плитки:
   N = (S × 1.1) / S_плитки (з запасом 10%)

4. Кількість ламінату:
   N = S × 1.07 (запас 7%)

ВАЖЛИВО:
- Завжди додавай запас 7-10% на матеріали
- Враховуй прорізи (двері, вікна) при розрахунку площ
- Для комерційних об'єктів використовуй посилені матеріали`,

      materials: getMaterialsByCategory('finishing'),
      workItems: getWorkItemsByCategory('finishing'),
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
    console.log(`🎨 FinishingAgent: Starting generation...`);

    const engineItems = this.runEngine('finishing', context);
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
      output = await this.enrichWithPriceEngine(output, context);

      const validationErrors = this.validateOutput(output);
      if (validationErrors.length > 0) {
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ FinishingAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ FinishingAgent error:`, error);

      return {
        sectionTitle: this.config.name,
        items: [],
        totalCost: 0,
        warnings: [`Помилка: ${error instanceof Error ? error.message : 'Unknown'}`]
      };
    }
  }

}
