/**
 * Orchestrator для координації спеціалізованих агентів
 */

import { BaseAgent, AgentContext, EstimateSection } from './base-agent';
import { DemolitionAgent } from './demolition-agent';
import { EarthworksAgent } from './earthworks-agent';
import { FoundationAgent } from './foundation-agent';
import { WallsAgent } from './walls-agent';
import { RoofingAgent } from './roofing-agent';
import { ElectricalAgent } from './electrical-agent';
import { HvacAgent } from './hvac-agent';
import { PlumbingAgent } from './plumbing-agent';
import { FireSafetyAgent } from './fire-safety-agent';
import { FinishingAgent } from './finishing-agent';
import { CrossValidator } from './cross-validator';
import { validateTotalCost, applyScalingIfNeeded } from './price-validator';

export type GenerationMode = 'gemini' | 'openai' | 'multi-agent';

export interface OrchestratorConfig {
  mode: GenerationMode;
  projectId?: string; // Для RAG
  wizardData: any;
  documents: {
    plans?: string[];
    specifications?: string[];
    geology?: string;
    sitePhotos?: string[];
  };
  projectNotes?: string;
}

export interface ProgressUpdate {
  phase: number | string;
  status: 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
  progress: number;
  data?: any;
}

export interface EstimateData {
  title: string;
  sections: EstimateSection[];
  summary: {
    materialsCost?: number;
    laborCost?: number;
    totalBeforeDiscount?: number;
  };
  validationIssues?: Array<{
    severity: 'error' | 'warning' | 'info';
    agent: string;
    message: string;
  }>;
  analysisSummary?: string; // Звіт інженера про аналіз проекту
}

/**
 * Orchestrator координує роботу всіх агентів
 */
export class EstimateOrchestrator {
  private agents: BaseAgent[];
  private mode: GenerationMode;
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.mode = config.mode;
    this.config = config;

    // Перевіряємо чи потрібен демонтаж
    const needsDemolition = this.checkIfDemolitionNeeded(config.wizardData);

    // Ініціалізація агентів залежно від режиму
    if (config.mode === 'multi-agent') {
      // MULTI-AGENT: Всі 10 спеціалізованих агентів (Gemini + OpenAI)
      this.agents = [
        ...(needsDemolition ? [new DemolitionAgent()] : []),  // ✅ Тільки якщо потрібен демонтаж
        new EarthworksAgent(),      // Gemini
        new FoundationAgent(),      // OpenAI
        new WallsAgent(),           // OpenAI
        new RoofingAgent(),         // Gemini
        new ElectricalAgent(),      // OpenAI
        new HvacAgent(),            // Gemini
        new PlumbingAgent(),        // OpenAI
        new FireSafetyAgent(),      // Gemini
        new FinishingAgent(),       // OpenAI
      ];
    } else if (config.mode === 'openai') {
      // OPENAI ONLY: Тільки OpenAI агенти (5 шт)
      this.agents = [
        new FoundationAgent(),
        new WallsAgent(),
        new ElectricalAgent(),
        new PlumbingAgent(),
        new FinishingAgent(),
      ];
    } else {
      // GEMINI ONLY: Тільки Gemini агенти (5 шт)
      this.agents = [
        ...(needsDemolition ? [new DemolitionAgent()] : []),  // ✅ Тільки якщо потрібен демонтаж
        new EarthworksAgent(),
        new RoofingAgent(),
        new HvacAgent(),
        new FireSafetyAgent(),
      ];
    }

    console.log(`🤖 Orchestrator initialized with ${this.agents.length} agents in ${config.mode} mode ${needsDemolition ? '(з демонтажем)' : '(БЕЗ демонтажу)'}`);
  }

  /**
   * Перевіряє чи потрібен демонтаж на основі wizard data
   */
  private checkIfDemolitionNeeded(wizardData: any): boolean {
    if (!wizardData) return false;

    // Для будинку/котеджу
    if (wizardData.houseData?.demolitionRequired === true) {
      console.log('✅ Демонтаж потрібен: houseData.demolitionRequired = true');
      return true;
    }

    // Для таунхаусу
    if (wizardData.townhouseData?.demolitionRequired === true) {
      console.log('✅ Демонтаж потрібен: townhouseData.demolitionRequired = true');
      return true;
    }

    // Для комерційної нерухомості
    if (wizardData.commercialData?.demolitionRequired === true) {
      console.log('✅ Демонтаж потрібен: commercialData.demolitionRequired = true');
      return true;
    }

    // Для реконструкції - завжди потрібен демонтаж
    if (wizardData.workScope === 'reconstruction') {
      console.log('✅ Демонтаж потрібен: workScope = reconstruction');
      return true;
    }

    // Для існуючої будівлі
    if (wizardData.houseData?.currentState === 'existing_building' ||
        wizardData.townhouseData?.currentState === 'existing_building' ||
        wizardData.commercialData?.currentState === 'existing_building') {
      console.log('✅ Демонтаж потрібен: currentState = existing_building');
      return true;
    }

    // Для ремонту квартири/офісу - якщо є demolition в workRequired
    if (wizardData.renovationData?.workRequired?.demolition === true) {
      console.log('✅ Демонтаж потрібен: renovationData.workRequired.demolition = true');
      return true;
    }

    console.log('❌ Демонтаж НЕ потрібен (нова будівля без демонтажу)');
    return false;
  }

  /**
   * Головний метод генерації кошторису
   */
  async generate(
    onProgress: (update: ProgressUpdate) => void
  ): Promise<EstimateData> {
    let sections: EstimateSection[] = [];
    const totalAgents = this.agents.length;
    const validationIssues: Array<{
      severity: 'error' | 'warning' | 'info';
      agent: string;
      message: string;
    }> = [];

    console.log(`🚀 Starting generation with ${totalAgents} agents...`);

    for (let i = 0; i < totalAgents; i++) {
      const agent = this.agents[i];
      const agentName = (agent as any).config.name || `Agent ${i + 1}`;
      const progress = ((i + 1) / totalAgents) * 100;

      onProgress({
        phase: i + 1,
        status: 'generating',
        message: `🤖 ${agentName}: генерація...`,
        progress: Math.floor(progress * 0.9), // Залишаємо 10% на фінальну валідацію
      });

      try {
        // Підготувати контекст для агента
        const context: AgentContext = {
          projectId: this.config.projectId, // Для RAG пошуку
          wizardData: this.config.wizardData,
          documents: this.config.documents,
          previousSections: sections, // Попередні результати
        };

        // Генерувати секцію
        const output = await agent.generate(context);

        // Додати секцію до результатів
        sections.push({
          title: output.sectionTitle,
          items: output.items,
          sectionTotal: output.totalCost,
        });

        // Зібрати попередження
        if (output.warnings && output.warnings.length > 0) {
          output.warnings.forEach(warning => {
            validationIssues.push({
              severity: 'warning',
              agent: agentName,
              message: warning
            });
          });
        }

        onProgress({
          phase: i + 1,
          status: 'complete',
          message: `✅ ${agentName}: ${output.items.length} позицій, ${output.totalCost.toFixed(0)} ₴`,
          progress: Math.floor(progress * 0.9),
          data: {
            sectionTitle: output.sectionTitle,
            itemsCount: output.items.length,
            totalCost: output.totalCost
          }
        });

      } catch (error) {
        console.error(`❌ Error in agent ${agentName}:`, error);

        validationIssues.push({
          severity: 'error',
          agent: agentName,
          message: error instanceof Error ? error.message : 'Unknown error'
        });

        onProgress({
          phase: i + 1,
          status: 'error',
          message: `❌ ${agentName}: помилка генерації`,
          progress: Math.floor(progress * 0.9),
        });
      }
    }

    // Валідація цін та масштабування якщо потрібно
    onProgress({
      phase: 'price-validation',
      status: 'generating',
      message: '💰 Перевірка реалістичності цін...',
      progress: 92,
    });

    // 💾 Зберегти оригінальну ціну ДО масштабування
    const originalTotal = sections.reduce((sum, s) => sum + s.sectionTotal, 0);
    let scalingInfo: { scaled: boolean; factor: number; originalTotal: number; reason?: string } | undefined;

    const priceValidation = validateTotalCost(sections, this.config.wizardData);

    if (!priceValidation.isValid) {
      console.warn('⚠️ Ціни виглядають нереалістично:');
      priceValidation.warnings.forEach(w => console.warn(`   ${w}`));
      priceValidation.suggestions.forEach(s => console.log(`   💡 ${s}`));

      // Спробувати автоматично виправити
      const scalingResult = applyScalingIfNeeded(sections, this.config.wizardData);

      if (scalingResult.scaled) {
        sections = scalingResult.sections;

        // 📊 Зберегти інформацію про масштабування
        const scaledTotal = sections.reduce((sum, s) => sum + s.sectionTotal, 0);
        scalingInfo = {
          scaled: true,
          factor: scalingResult.factor,
          originalTotal: originalTotal,
          reason: priceValidation.warnings.join('; ')
        };

        validationIssues.push({
          severity: 'warning',
          agent: 'PriceValidator',
          message: `Ціни були автоматично скореговані (коефіцієнт ${scalingResult.factor.toFixed(2)}x) для відповідності ринковим реаліям`
        });

        console.log(`📊 Масштабування: ${originalTotal.toLocaleString()} ₴ → ${scaledTotal.toLocaleString()} ₴`);

        onProgress({
          phase: 'price-validation',
          status: 'complete',
          message: `✅ Ціни скореговані (×${scalingResult.factor.toFixed(2)})`,
          progress: 94,
        });
      }
    } else {
      onProgress({
        phase: 'price-validation',
        status: 'complete',
        message: '✅ Ціни в межах норми',
        progress: 94,
      });
    }

    // Фінальна валідація
    onProgress({
      phase: 'final',
      status: 'generating',
      message: '🔍 Фінальна валідація...',
      progress: 95,
    });

    // Перехресна валідація
    const crossValidator = new CrossValidator();
    const crossValidationIssues = crossValidator.validate(sections);

    // Додати issues до загального списку
    crossValidationIssues.forEach(issue => {
      validationIssues.push({
        severity: issue.severity,
        agent: issue.agent,
        message: `${issue.item}: ${issue.message}. ${issue.suggestion}`
      });
    });

    const stats = crossValidator.getValidationStats(crossValidationIssues);
    console.log(`📊 Validation stats: ${stats.errors} errors, ${stats.warnings} warnings, ${stats.info} info`);

    // Розрахувати загальні суми
    const totalBeforeDiscount = sections.reduce((sum, s) => sum + s.sectionTotal, 0);

    const materialsCost = sections.reduce((sum, section) => {
      return sum + section.items.reduce((itemSum, item) => {
        return itemSum + (item.quantity * item.unitPrice);
      }, 0);
    }, 0);

    const laborCost = sections.reduce((sum, section) => {
      return sum + section.items.reduce((itemSum, item) => {
        return itemSum + (item.laborCost || 0);
      }, 0);
    }, 0);

    console.log(`✅ Generation complete: ${sections.length} sections, ${totalBeforeDiscount.toFixed(0)} ₴`);
    console.log(`   Materials: ${materialsCost.toFixed(0)} ₴, Labor: ${laborCost.toFixed(0)} ₴`);
    console.log(`   Validation issues: ${validationIssues.length} (${validationIssues.filter(i => i.severity === 'error').length} errors)`);

    // Генерація звіту інженера про аналіз
    onProgress({
      phase: 'final',
      status: 'generating',
      message: '📝 Підготовка звіту інженера...',
      progress: 98,
    });

    const analysisSummary = await this.generateAnalysisSummary(sections, validationIssues);

    return {
      title: `AI Кошторис (${this.mode === 'multi-agent' ? 'Multi-Agent' : this.mode === 'openai' ? 'OpenAI' : 'Gemini'})`,
      sections,
      summary: {
        materialsCost,
        laborCost,
        totalBeforeDiscount,
      },
      validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
      analysisSummary,
      scalingInfo, // 📊 Інформація про масштабування цін
    };
  }

  /**
   * Генерація звіту інженера про аналіз проекту
   */
  private async generateAnalysisSummary(
    sections: EstimateSection[],
    validationIssues: Array<{ severity: string; agent: string; message: string }>
  ): Promise<string> {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Підготувати інформацію про секції
      const sectionsInfo = sections.map(s => ({
        title: s.title,
        itemsCount: s.items.length,
        total: s.sectionTotal,
        keyItems: s.items.slice(0, 3).map(item => `${item.description} (${item.quantity} ${item.unit})`)
      }));

      const prompt = `Ти - головний інженер-кошторисник. Склади КОРОТКИЙ звіт про проаналізований проект.

ПРОАНАЛІЗОВАНІ ДОКУМЕНТИ:
${this.config.documents.plans ? `- Креслення: ${this.config.documents.plans.length} файлів` : ''}
${this.config.documents.specifications ? `- Специфікації: ${this.config.documents.specifications.length} файлів` : ''}
${this.config.documents.geology ? `- Геологічні дані: є` : ''}
${this.config.documents.sitePhotos ? `- Фото об'єкта: ${this.config.documents.sitePhotos.length} шт` : ''}

ПАРАМЕТРИ З WIZARD:
${JSON.stringify(this.config.wizardData, null, 2)}

ЗГЕНЕРОВАНІ СЕКЦІЇ:
${sectionsInfo.map(s => `- ${s.title}: ${s.itemsCount} позицій, ${s.total.toFixed(0)} ₴`).join('\n')}

ВИЯВЛЕНІ ПРОБЛЕМИ:
${validationIssues.length > 0 ? validationIssues.map(i => `- [${i.severity}] ${i.message}`).join('\n') : 'Немає критичних проблем'}

ТВОЄ ЗАВДАННЯ:
Напиши звіт (3-5 абзаців) для замовника, який ЗРОЗУМІЛО пояснює:

1. **ЩО ПРОАНАЛІЗОВАНО:**
   - Які документи опрацьовано
   - Які ключові параметри витягнуто (площа, поверхи, матеріали тощо)
   - Що було зрозуміло з документації

2. **ЯК ФОРМУВАВСЯ КОШТОРИС:**
   - На основі яких даних
   - Які системи включено (фундамент, стіни, електрика тощо)
   - Чи всі секції охоплені

3. **НА ЩО ЗВЕРНУТИ УВАГУ:**
   - Чи є недостатньо інформації в якихось розділах
   - Які припущення зроблено
   - Що варто уточнити перед початком робіт

СТИЛЬ:
- Професійно, але зрозуміло
- Конкретні цифри і факти
- Без загальних фраз
- Максимум 500 слів

ФОРМАТ:
Простий текст з абзацами (без markdown заголовків).`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Ти - досвідчений інженер-кошторисник, який пояснює технічні деталі зрозумілою мовою.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const summary = response.choices[0]?.message?.content || 'Звіт недоступний';

      console.log(`📝 Analysis summary generated: ${summary.length} characters`);

      return summary;

    } catch (error) {
      console.error('Error generating analysis summary:', error);
      return 'На жаль, не вдалось згенерувати звіт інженера.';
    }
  }
}
