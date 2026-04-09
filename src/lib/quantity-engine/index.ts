/**
 * Public API of the deterministic quantity engine.
 *
 * Usage from an agent:
 *
 *   const result = runQuantityEngine('electrical', { facts, wizardData });
 *   const promptBlock = formatEngineItemsForPrompt(result.items);
 *   // ...feed `promptBlock` into the LLM, then merge LLM output with engine items.
 */

import type { ProjectFacts } from '../project-facts/types';
import type { WizardData } from '../wizard-types';
import type { EngineCategory, EngineItem, EngineResult } from './types';
import { computeGeometry } from './geometry';
import { electricalRules } from './rules/electrical';
import { plumbingRules } from './rules/plumbing';
import { finishingRules } from './rules/finishing';
import { foundationRules } from './rules/foundation';
import { wallsRules } from './rules/walls';

const RULES: Record<EngineCategory, (ctx: any) => EngineItem[]> = {
  electrical: electricalRules,
  plumbing: plumbingRules,
  finishing: finishingRules,
  foundation: foundationRules,
  walls: wallsRules,
};

export function runQuantityEngine(
  category: EngineCategory,
  input: { facts: ProjectFacts; wizardData: WizardData }
): EngineResult {
  const geometry = computeGeometry(input.facts, input.wizardData);
  const ruleFn = RULES[category];
  if (!ruleFn) {
    return { category, items: [], skippedRules: [] };
  }
  const items = ruleFn({
    facts: input.facts,
    wizardData: input.wizardData,
    geometry,
  });
  return {
    category,
    items,
    skippedRules: [],
  };
}

/**
 * Format engine items into a prompt block that instructs the LLM to keep
 * these positions unchanged and only add net-new items.
 */
export function formatEngineItemsForPrompt(items: EngineItem[]): string {
  if (items.length === 0) return '';
  const lines = items.map((item) => {
    const formula = item.formula ? ` — формула: ${item.formula}` : '';
    return `  • [${item.canonicalKey}] ${item.description}: ${item.quantity} ${item.unit}${formula}`;
  });
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ОБОВ'ЯЗКОВІ ДЕТЕРМІНОВАНІ ПОЗИЦІЇ (порахував Quantity Engine)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ці позиції ВЖЕ розраховані за формулами на основі ProjectFacts.
ПРАВИЛА:
1. Ти ЗОБОВ'ЯЗАНИЙ повернути ці позиції з тими ж quantity та unit. Не змінюй кількості.
2. Заповни для них unitPrice та laborCost — це твоє завдання (Prozorro / база матеріалів).
3. Додавай ТІЛЬКИ ДОДАТКОВІ позиції, яких немає у списку нижче (рідкісне обладнання, специфічні матеріали з документів, нестандартні роботи).
4. Не дублюй позиції з іншими canonicalKey, але тим самим змістом.

ПОЗИЦІЇ:
${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export * from './types';
export { computeGeometry } from './geometry';
