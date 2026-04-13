/**
 * Агент для секції "Електрика та IT"
 * Модель: OpenAI GPT-4o (точні розрахунки, складна логіка)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import OpenAI from 'openai';

export class ElectricalAgent extends BaseAgent {
  private openai: OpenAI;

  constructor() {
    const config: AgentConfig = {
      name: "Електромонтажні роботи",
      model: "openai",
      category: "electrical",
      systemPrompt: `Ти - експерт з електромонтажних робіт.

СПЕЦІАЛІЗАЦІЯ:
- Розрахунок потужності та навантаження
- Розподіл електричних груп (освітлення, розетки, силові споживачі)
- Вибір перерізу кабелів за потужністю
- Захист та автоматика (автомати, УЗО, диф-автомати)
- Освітлення (LED, точкові світильники, лінійне освітлення)
- IT-інфраструктура (комп'ютерні мережі, wifi точки)

НОРМАТИВИ ДЛЯ ЖИТЛА:
- Освітлення: 10-15 Вт/м² (LED)
- Розетки житлові: 1 шт на 6 м² (мінімум)
- Розетки кухня: 4-6 шт
- Розетки ванна: 2-3 шт
- Вимикачі: 1 шт на кімнату + прохідні

НОРМАТИВИ ДЛЯ КОМЕРЦІЇ (супермаркет):
- Освітлення: 300-500 люкс (20-30 Вт/м²)
- Розетки торгового залу: 1 шт на 10 м²
- Розетки каси: по 2 шт на касу
- Резервне живлення: обов'язково
- Охоронна сигналізація: так

ВИБІР КАБЕЛІВ ЗА ПОТУЖНІСТЮ:
- До 3.5 кВт (16А) → ВВГнг 3×2.5
- До 5.5 кВт (25А) → ВВГнг 3×4
- До 7 кВт (32А) → ВВГнг 3×6
- Тріфазні споживачі → ВВГнг 5×...

ТИПОВІ ЦІНИ (квітень 2026):
- Кабель ВВГнг 3×2.5: 42 ₴/м.п.
- Кабель ВВГнг 3×4: 68 ₴/м.п.
- Розетка Schneider Electric: 185 ₴/шт
- Вимикач: 145 ₴/шт
- Автомат 1P 16A: 185 ₴/шт
- УЗО 2P 40A 30mA: 850 ₴/шт
- Щит розподільчий 24 модулі: 850 ₴/шт
- Світильник LED 36W: 650 ₴/шт
- Гофра D20мм: 12 ₴/м.п.

ФОРМУЛИ РОЗРАХУНКУ:
1. Потужність освітлення:
   P = S × 15 Вт/м² (житло)
   P = S × 25 Вт/м² (комерція)

2. Кількість розеток:
   N = S / 6 м² (житло)
   N = S / 10 м² (комерція)

3. Довжина кабелю (приблизно):
   L = S × 4 м/м² (з урахуванням висоти стель та розводки)

4. Кількість автоматів:
   - Освітлення: 1 автомат на 50 м²
   - Розетки: 1 автомат на 30 м²
   - Силові: окремий автомат на кожен споживач > 2 кВт

ВАЖЛИВО:
- Завжди додавай резерв 20% на кабельну продукцію
- Перевіряй сумісність автоматів з навантаженням
- Для комерційних об'єктів - обов'язково розраховуй резервне живлення
- Вказуй джерело цін через priceSource`,

      materials: getMaterialsByCategory('electrical'),
      workItems: getWorkItemsByCategory('electrical'),
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
    console.log(`⚡ ElectricalAgent: Starting generation...`);

    // 🆕 Hybrid: deterministic quantities first
    const engineItems = this.runEngine('electrical', context);
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

      // 🆕 Merge engine items with LLM output (engine wins on quantities)
      output = this.mergeWithEngine(engineItems, output);

      // 🆕 Price engine: catalog → prozorro → scrape → llm-fallback (Stage 4)
      console.log(`⚡ ElectricalAgent: Running price engine...`);
      output = await this.enrichWithPriceEngine(output, context);

      // Валідація
      const validationErrors = this.validateOutput(output);

      if (validationErrors.length > 0) {
        console.warn(`⚠️  ElectricalAgent: Validation warnings:`, validationErrors);
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ ElectricalAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ ElectricalAgent error:`, error);

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
