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
import { PreAnalysisAgent, type PreAnalysisResult } from './pre-analysis-agent';
import { MasterEstimateAgent } from './master-estimate-agent';
import { buildProjectFacts } from '../project-facts/builder';
import type { ProjectFacts } from '../project-facts/types';
import { getExtractedProjectData } from '../rag/vectorizer';
import { runAllValidators } from '../validators';
import { zeroPriceFixer, type ZeroPriceFixResult } from '../services/zero-price-fixer';

export type GenerationMode = 'gemini' | 'openai' | 'multi-agent' | 'master';

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
  prozorroSearchQuery?: string; // Опис для пошуку на Prozorro
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
  analysisSummary?: string; // Звіт інженера про аналіз проекту (plain text fallback)
  structuredReport?: import('../types/bid-intelligence').StructuredEngineerReport; // Structured execution report v2
  preAnalysisResult?: PreAnalysisResult; // 🆕 Результат комплексного аналізу
  zeroPriceFixResult?: ZeroPriceFixResult; // 🆕 Результат допошуку цін
  scalingInfo?: {
    scaled: boolean;
    factor: number;
    originalTotal: number;
    reason?: string;
  };
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

    // 🆕 КРОК 0: Комплексний pre-analysis перед генерацією
    onProgress({
      phase: 'pre-analysis',
      status: 'analyzing',
      message: '🔍 Аналізую всі дані проекту...',
      progress: 0,
    });

    console.log(`🔍 Starting comprehensive pre-analysis...`);

    const preAnalysisAgent = new PreAnalysisAgent();
    const preAnalysisResult = await preAnalysisAgent.analyze({
      wizardData: this.config.wizardData,
      projectId: this.config.projectId,
      projectNotes: this.config.projectNotes,
      documents: this.config.documents,
      prozorroSearchQuery: this.config.prozorroSearchQuery,
    });

    console.log(`✅ Pre-analysis complete:`, {
      wizardAnalyzed: true,
      documentsFound: preAnalysisResult.documentsAnalysis.hasDocuments,
      prozorroProjects: preAnalysisResult.prozorroAnalysis.similarProjectsFound,
      prozorroItems: preAnalysisResult.prozorroAnalysis.totalItemsParsed,
    });

    onProgress({
      phase: 'pre-analysis',
      status: 'complete',
      message: `✅ Аналіз завершено: ${preAnalysisResult.projectSummary}`,
      progress: 5,
      data: {
        prozorroProjects: preAnalysisResult.prozorroAnalysis.similarProjectsFound,
        prozorroItems: preAnalysisResult.prozorroAnalysis.totalItemsParsed,
        recommendations: preAnalysisResult.recommendations,
        warnings: preAnalysisResult.warnings,
      },
    });

    // 🆕 КРОК 0.5: Побудувати нормалізовані ProjectFacts
    // Це staging-структура під майбутній deterministic quantity engine.
    // Поки що ми лише складаємо її і прокидаємо в AgentContext — агенти
    // можуть починати споживати її поступово.
    let projectFacts: ProjectFacts | undefined;
    try {
      const extracted = this.config.projectId
        ? await getExtractedProjectData(this.config.projectId)
        : null;
      projectFacts = buildProjectFacts({
        wizardData: this.config.wizardData,
        extracted,
      });
      if (projectFacts.conflicts.length > 0) {
        console.warn(
          `[Orchestrator] ProjectFacts conflicts (${projectFacts.conflicts.length}):`,
          projectFacts.conflicts
        );
      } else {
        console.log(`[Orchestrator] ProjectFacts built (no conflicts)`);
      }
    } catch (e) {
      console.error('[Orchestrator] Failed to build ProjectFacts:', e);
    }

    // 🆕 РЕЖИМ MASTER: Один агент генерує ВСЕ одночасно
    if (this.mode === 'master') {
      console.log(`🎯 Using MASTER agent mode (single comprehensive generation)`);

      onProgress({
        phase: 'master-generation',
        status: 'generating',
        message: '🎯 Генерація детального кошторису (секція-за-секцією)...',
        progress: 10,
      });

      try {
        const masterAgent = new MasterEstimateAgent();

        const context: AgentContext = {
          projectId: this.config.projectId,
          wizardData: this.config.wizardData,
          documents: this.config.documents,
          previousSections: [],
          masterContext: preAnalysisResult.masterContext,
          projectFacts,
        };

        // Передаємо progress callback для real-time оновлень по секціях
        const masterResult = await masterAgent.generate(context, (update) => {
          const progressPercent = 10 + Math.floor((update.sectionIndex / update.totalSections) * 80);

          if (update.status === 'generating') {
            onProgress({
              phase: `master-${update.sectionIndex + 1}`,
              status: 'generating',
              message: `🔨 [${update.sectionIndex + 1}/${update.totalSections}] ${update.sectionTitle}...`,
              progress: progressPercent,
            });
          } else if (update.status === 'complete') {
            onProgress({
              phase: `master-${update.sectionIndex + 1}`,
              status: 'complete',
              message: `✅ [${update.sectionIndex + 1}/${update.totalSections}] ${update.sectionTitle}: ${update.itemsGenerated} позицій`,
              progress: progressPercent,
              data: {
                sectionTitle: update.sectionTitle,
                itemsCount: update.itemsGenerated,
              }
            });
          } else if (update.status === 'error') {
            onProgress({
              phase: `master-${update.sectionIndex + 1}`,
              status: 'error',
              message: update.error
                ? `❌ ${update.sectionTitle}: ${update.error}`
                : `❌ ${update.sectionTitle}: помилка`,
              progress: progressPercent,
              data: { error: update.error, sectionTitle: update.sectionTitle },
            });
          }
        });

        sections = masterResult.sections;

        // Зібрати попередження
        if (masterResult.warnings && masterResult.warnings.length > 0) {
          masterResult.warnings.forEach(warning => {
            validationIssues.push({
              severity: 'warning',
              agent: 'MasterAgent',
              message: warning
            });
          });
        }

        onProgress({
          phase: 'master-generation',
          status: 'complete',
          message: `✅ MasterAgent: ${masterResult.sections.length} секцій, ${masterResult.totalCost.toFixed(0)} ₴`,
          progress: 90,
          data: {
            sectionsGenerated: masterResult.metadata.sectionsGenerated,
            totalItems: masterResult.metadata.totalItems,
            prozorroPricesUsed: masterResult.metadata.prozorroPricesUsed,
            googlePricesUsed: masterResult.metadata.googlePricesUsed,
          }
        });

        console.log(`✅ Master generation complete:`, {
          sections: masterResult.sections.length,
          items: masterResult.metadata.totalItems,
          total: masterResult.totalCost,
          prozorroUsage: masterResult.metadata.prozorroPricesUsed,
        });

      } catch (error) {
        console.error(`❌ Error in MasterAgent:`, error);

        validationIssues.push({
          severity: 'error',
          agent: 'MasterAgent',
          message: error instanceof Error ? error.message : 'Unknown error'
        });

        onProgress({
          phase: 'master-generation',
          status: 'error',
          message: `❌ MasterAgent: помилка генерації`,
          progress: 90,
        });

        throw error;
      }
    } else {
      // MULTI-AGENT режим: послідовна генерація секцій
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
          masterContext: preAnalysisResult.masterContext, // 🆕 Комплексний аналіз
          projectFacts, // 🆕 Нормалізовані факти проекту
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
    } // END multi-agent mode

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

    // 🆕 Rule-based validators (Plan Stage 7).
    try {
      const ruleReport = runAllValidators({
        estimate: { sections: sections as any },
        facts: projectFacts,
        wizardData: this.config.wizardData,
      });
      console.log(
        `🔍 Rule-based validators: ${ruleReport.errorCount} errors, ` +
        `${ruleReport.warningCount} warnings, ${ruleReport.infoCount} info — ` +
        `${JSON.stringify(ruleReport.byValidator)}`
      );
      for (const issue of ruleReport.issues) {
        validationIssues.push({
          severity: issue.severity === 'info' ? 'info' : issue.severity,
          agent: `RuleValidator/${issue.code}`,
          message: issue.section
            ? `[${issue.section}] ${issue.message}`
            : issue.message,
        });
      }
    } catch (e) {
      console.error('[Orchestrator] Rule-based validators failed:', e);
    }

    // 🆕 Zero Price Fixer — знайти позиції з ціною 0 і спробувати через іншу модель
    let zeroPriceFixResult: ZeroPriceFixResult | undefined;
    const zeroCount = sections.reduce((sum, s) => sum + s.items.filter(i => i.unitPrice === 0 && i.quantity > 0).length, 0);
    if (zeroCount > 0) {
      onProgress({
        phase: 'final',
        status: 'generating',
        message: `🔍 Допошук цін для ${zeroCount} позицій через альтернативну модель...`,
        progress: 96,
      });

      try {
        const primaryModel = this.mode === 'gemini' ? 'gemini' : 'openai';
        const wd = this.config.wizardData;
        zeroPriceFixResult = await zeroPriceFixer.fix(sections, primaryModel as any, {
          objectType: wd?.objectType,
          area: wd?.totalArea,
        });

        if (zeroPriceFixResult.fixedCount > 0) {
          console.log(`✅ ZeroPriceFixer: виправлено ${zeroPriceFixResult.fixedCount}/${zeroPriceFixResult.totalZeroItems} позицій`);

          // Remove cross-validation "price = 0" errors for fixed items
          const fixedDescs = new Set(zeroPriceFixResult.fixedItems.map(f => f.description));
          const beforeLen = validationIssues.length;
          const filtered = validationIssues.filter(vi =>
            !(vi.message.includes('Ціна = 0') && fixedDescs.has(vi.message.split(':')[0]?.trim() || ''))
          );
          if (filtered.length < beforeLen) {
            validationIssues.length = 0;
            validationIssues.push(...filtered);
          }
        }
      } catch (e) {
        console.error('[ZeroPriceFixer] Failed:', e);
      }
    }

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

    // Генерація структурованого звіту інженера (v2) + plain text fallback
    const { structuredReport, analysisSummary } = await this.generateStructuredReport(sections, validationIssues);

    return {
      title: `AI Кошторис (${this.mode === 'master' ? 'Master Agent' : this.mode === 'multi-agent' ? 'Multi-Agent' : this.mode === 'openai' ? 'OpenAI' : 'Gemini'})`,
      sections,
      summary: {
        materialsCost,
        laborCost,
        totalBeforeDiscount,
      },
      validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
      analysisSummary,
      structuredReport,
      preAnalysisResult, // 🆕 Результат комплексного аналізу
      zeroPriceFixResult, // 🆕 Допошук нульових цін
      scalingInfo, // 📊 Інформація про масштабування цін
    };
  }

  /**
   * Генерація структурованого звіту інженера (v2)
   * Повертає structured JSON + plain text fallback
   */
  private async generateStructuredReport(
    sections: EstimateSection[],
    validationIssues: Array<{ severity: string; agent: string; message: string }>
  ): Promise<{
    structuredReport?: import('../types/bid-intelligence').StructuredEngineerReport;
    analysisSummary: string;
  }> {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const sectionsInfo = sections.map(s => ({
        title: s.title,
        itemsCount: s.items.length,
        total: s.sectionTotal,
        keyItems: s.items.slice(0, 3).map(item => `${item.description} (${item.quantity} ${item.unit})`)
      }));

      const wd = this.config.wizardData;
      const totalAmount = sections.reduce((sum, s) => sum + s.sectionTotal, 0);

      const prompt = `Ти - головний інженер-кошторисник. Сформуй СТРУКТУРОВАНИЙ ЗВІТ у форматі JSON.

ПРОАНАЛІЗОВАНІ ДОКУМЕНТИ:
${this.config.documents.plans ? `- Креслення: ${this.config.documents.plans.length} файлів` : "- Креслення: немає"}
${this.config.documents.specifications ? `- Специфікації: ${this.config.documents.specifications.length} файлів` : "- Специфікації: немає"}
${this.config.documents.geology ? "- Геологічні дані: є" : "- Геологічні дані: немає"}
${this.config.documents.sitePhotos ? `- Фото об\u0027єкта: ${this.config.documents.sitePhotos.length} шт` : "- Фото об\u0027єкта: немає"}

ПАРАМЕТРИ З WIZARD:
- Тип об'єкта: ${wd.objectType || 'не вказано'}
- Площа: ${wd.totalArea || 'не вказано'} м²
- Поверхи: ${wd.houseData?.floors || wd.apartmentData?.floor || 'не вказано'}
${wd.objectType === 'commercial' ? `- Призначення: ${wd.commercialData?.purpose || 'не вказано'}` : ''}
${wd.objectType === 'commercial' ? `- HVAC: ${wd.commercialData?.hvac ? 'так' : 'ні'}` : ''}
${JSON.stringify(wd, null, 2)}

ЗГЕНЕРОВАНІ СЕКЦІЇ КОШТОРИСУ (загальна сума: ${totalAmount.toFixed(0)} ₴):
${sectionsInfo.map(s => `- ${s.title}: ${s.itemsCount} позицій, ${s.total.toFixed(0)} ₴`).join('\n')}

ВИЯВЛЕНІ ПРОБЛЕМИ:
${validationIssues.length > 0 ? validationIssues.map(i => `- [${i.severity}] ${i.message}`).join('\n') : 'Немає критичних проблем'}

ЗАВДАННЯ:
Сформуй JSON-об'єкт зі структурою нижче. Кожне поле обов'язкове.

{
  "projectUnderstanding": {
    "objectType": "тип об'єкта",
    "scope": "стислий опис обсягу робіт (1-2 речення)",
    "area": число або null,
    "floors": число або null,
    "keyParameters": { "ключ": "значення", ... },
    "documentsAnalyzed": ["список документів що аналізувались"]
  },
  "assumptions": ["припущення що зроблені при розрахунку (3-7 штук)"],
  "missingInputs": ["чого бракує для точнішого розрахунку (3-7 штук)"],
  "executionSequence": [
    {
      "order": 1,
      "name": "Назва етапу",
      "goal": "Що має бути зроблено",
      "prerequisites": ["що потрібно до початку"],
      "estimatedDuration": "орієнтовний термін",
      "risks": ["ризики цього етапу"],
      "controlPoints": ["що перевірити після завершення"],
      "dependsOn": []
    }
  ],
  "preStartChecklist": [
    { "category": "permits|design|logistics|safety|utilities|other", "item": "опис", "critical": true/false }
  ],
  "criticalDependencies": ["критичні залежності між роботами"],
  "riskWarnings": [
    { "severity": "high|medium|low", "area": "область ризику", "description": "опис", "mitigation": "як мінімізувати" }
  ]
}

ВАЖЛИВО:
- executionSequence має бути РЕАЛІСТИЧНОЮ послідовністю для цього типу об'єкта
- Для нового будівництва: підготовка → фундамент → коробка → інженерія → оздоблення
- Для ремонту: демонтаж → інженерія → оздоблення
- Для комерційного об'єкта: враховуй специфіку (HVAC, холодильне обладнання, торгове обладнання)
- riskWarnings: мінімум 3 ризики
- preStartChecklist: мінімум 5 пунктів
- missingInputs: реальні прогалини з наданих даних`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Ти - досвідчений інженер-кошторисник. Відповідай ТІЛЬКИ валідним JSON без markdown.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content || '{}';
      let parsed: any;

      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error('Failed to parse structured report JSON');
        return {
          analysisSummary: raw,
        };
      }

      // Build StructuredEngineerReport
      const structuredReport: import('../types/bid-intelligence').StructuredEngineerReport = {
        version: 2,
        projectUnderstanding: {
          objectType: parsed.projectUnderstanding?.objectType || wd.objectType || 'unknown',
          scope: parsed.projectUnderstanding?.scope || '',
          area: parsed.projectUnderstanding?.area || (wd.totalArea ? parseFloat(wd.totalArea) : undefined),
          floors: parsed.projectUnderstanding?.floors,
          keyParameters: parsed.projectUnderstanding?.keyParameters || {},
          documentsAnalyzed: parsed.projectUnderstanding?.documentsAnalyzed || [],
        },
        assumptions: parsed.assumptions || [],
        missingInputs: parsed.missingInputs || [],
        executionSequence: (parsed.executionSequence || []).map((s: any, i: number) => ({
          order: s.order || i + 1,
          name: s.name || `Етап ${i + 1}`,
          goal: s.goal || '',
          prerequisites: s.prerequisites || [],
          estimatedDuration: s.estimatedDuration,
          risks: s.risks || [],
          controlPoints: s.controlPoints || [],
          dependsOn: s.dependsOn || [],
        })),
        preStartChecklist: (parsed.preStartChecklist || []).map((c: any) => ({
          category: c.category || 'other',
          item: c.item || '',
          critical: c.critical ?? false,
        })),
        criticalDependencies: parsed.criticalDependencies || [],
        riskWarnings: (parsed.riskWarnings || []).map((r: any) => ({
          severity: r.severity || 'medium',
          area: r.area || '',
          description: r.description || '',
          mitigation: r.mitigation || '',
        })),
      };

      // Generate plain text fallback from structured data
      const plainText = this.structuredReportToPlainText(structuredReport);

      console.log(`📝 Structured report generated: ${structuredReport.executionSequence.length} stages, ${structuredReport.riskWarnings.length} risks`);

      return {
        structuredReport,
        analysisSummary: plainText,
      };

    } catch (error) {
      console.error('Error generating structured report:', error);
      return {
        analysisSummary: 'На жаль, не вдалось згенерувати звіт інженера.',
      };
    }
  }

  /**
   * Конвертувати structured report у plain text для backward compatibility
   */
  private structuredReportToPlainText(report: import('../types/bid-intelligence').StructuredEngineerReport): string {
    const lines: string[] = [];

    lines.push(`Проект: ${report.projectUnderstanding.objectType}, ${report.projectUnderstanding.scope}`);
    if (report.projectUnderstanding.area) {
      lines.push(`Площа: ${report.projectUnderstanding.area} м².`);
    }
    lines.push('');

    if (report.assumptions.length > 0) {
      lines.push('Припущення:');
      report.assumptions.forEach(a => lines.push(`- ${a}`));
      lines.push('');
    }

    if (report.missingInputs.length > 0) {
      lines.push('Що потрібно уточнити:');
      report.missingInputs.forEach(m => lines.push(`- ${m}`));
      lines.push('');
    }

    if (report.executionSequence.length > 0) {
      lines.push('Рекомендована послідовність робіт:');
      report.executionSequence.forEach(s => {
        lines.push(`${s.order}. ${s.name} — ${s.goal}`);
      });
      lines.push('');
    }

    if (report.riskWarnings.length > 0) {
      lines.push('Ризики:');
      report.riskWarnings.forEach(r => {
        lines.push(`- [${r.severity}] ${r.area}: ${r.description}. Мітигація: ${r.mitigation}`);
      });
    }

    return lines.join('\n');
  }
}
