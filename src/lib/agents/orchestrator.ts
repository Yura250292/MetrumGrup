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

    // Ініціалізація агентів залежно від режиму
    if (config.mode === 'multi-agent') {
      // MULTI-AGENT: Всі 10 спеціалізованих агентів (Gemini + OpenAI)
      this.agents = [
        new DemolitionAgent(),      // Gemini
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
        new DemolitionAgent(),
        new EarthworksAgent(),
        new RoofingAgent(),
        new HvacAgent(),
        new FireSafetyAgent(),
      ];
    }

    console.log(`🤖 Orchestrator initialized with ${this.agents.length} agents in ${config.mode} mode`);
  }

  /**
   * Головний метод генерації кошторису
   */
  async generate(
    onProgress: (update: ProgressUpdate) => void
  ): Promise<EstimateData> {
    const sections: EstimateSection[] = [];
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

    return {
      title: `AI Кошторис (${this.mode === 'multi-agent' ? 'Multi-Agent' : this.mode === 'openai' ? 'OpenAI' : 'Gemini'})`,
      sections,
      summary: {
        materialsCost,
        laborCost,
        totalBeforeDiscount,
      },
      validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
    };
  }
}
