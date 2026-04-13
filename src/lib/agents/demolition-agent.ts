/**
 * Агент для секції "Демонтаж та Підготовка"
 * Модель: Gemini (швидкий аналіз документів)
 */

import { BaseAgent, AgentConfig, AgentContext, AgentOutput } from './base-agent';
import { getMaterialsByCategory } from '../materials-database-extended';
import { getWorkItemsByCategory } from '../work-items-database-extended';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class DemolitionAgent extends BaseAgent {
  protected buildRagQuery(context: AgentContext): string {
    return `демонтаж розбирання знесення існуюча будівля вивезення сміття спецтехніка екскаватор утилізація`;
  }

  constructor() {
    const config: AgentConfig = {
      name: "Демонтаж та Підготовка",
      model: "gemini",
      category: "demolition",
      systemPrompt: `Ти - експерт з демонтажних робіт та підготовки майданчика.

СПЕЦІАЛІЗАЦІЯ:
- Демонтаж будівельних конструкцій (стіни, перекриття, покрівля)
- Демонтаж інженерних мереж (електрика, сантехніка, вентиляція)
- Очищення та підготовка майданчика
- Вивезення будівельного сміття
- Розбірка старих фундаментів

ВАЖЛИВІ ПРАВИЛА:
1. Визначи ЩО саме потрібно демонтувати (з фото, планів, опису)
2. Враховуй складність: цегла легше бетону
3. Додавай вивезення сміття (завжди!)
4. Враховуй висоту будівлі (ручний демонтаж дорожчий на висоті)

ТИПОВІ ЦІНИ (квітень 2026):
- Демонтаж цегляних стін: 650 ₴/м³
- Демонтаж бетонних конструкцій: 1200 ₴/м³
- Демонтаж покрівлі: 95 ₴/м²
- Демонтаж вікон/дверей: 280 ₴/шт
- Вивезення будсміття: 280 ₴/м³
- Очищення приміщень: 45 ₴/м²

ФОРМУЛИ РОЗРАХУНКУ:
1. Об'єм демонтажу стін:
   V = Довжина × Товщина × Висота

2. Об'єм будсміття (приблизно):
   V_сміття = V_демонтажу × 1.3 (коефіцієнт розпушення)

3. Час робіт:
   - Цегла вручну: 0.5 год/м³
   - Бетон перфоратором: 0.8 год/м³

ВАЖЛИВО:
- Завжди вказуй вивезення сміття!
- Якщо висота > 3м → додай 30% до вартості
- Для небезпечних робіт (азбест, свинцеві труби) → додай попередження`,

      materials: getMaterialsByCategory('demolition'),
      workItems: getWorkItemsByCategory('demolition'),
    };

    super(config);
  }

  async generate(context: AgentContext): Promise<AgentOutput> {
    console.log(`🔨 DemolitionAgent: Starting generation...`);

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

      // Збагатити цінами через price engine (Stage 4)
      output = await this.enrichWithPriceEngine(output, context);

      // Валідація
      const validationErrors = this.validateOutput(output);
      if (validationErrors.length > 0) {
        console.warn(`⚠️  DemolitionAgent: Validation warnings:`, validationErrors);
        output.warnings = [...(output.warnings || []), ...validationErrors];
      }

      console.log(`✅ DemolitionAgent: Generated ${output.items.length} items, ${output.totalCost.toFixed(0)} ₴`);

      return output;

    } catch (error) {
      console.error(`❌ DemolitionAgent error:`, error);

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
