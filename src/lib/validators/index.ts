/**
 * Public API of the rule-based validator suite (Plan Stage 7).
 *
 * Usage:
 *   const issues = runAllValidators({ estimate, facts, wizardData });
 *   const errors = issues.filter(i => i.severity === 'error');
 */

import type { ValidationIssue, Validator, ValidatorContext } from './types';
import { structuralValidator } from './structural-validator';
import { quantityValidator } from './quantity-validator';
import { priceValidator } from './price-validator';
import { completenessValidator } from './completeness-validator';
import { wizardConsistencyValidator } from './wizard-consistency-validator';

const ALL_VALIDATORS: Array<{ name: string; fn: Validator }> = [
  { name: 'structural', fn: structuralValidator },
  { name: 'quantity', fn: quantityValidator },
  { name: 'price', fn: priceValidator },
  { name: 'completeness', fn: completenessValidator },
  { name: 'wizard-consistency', fn: wizardConsistencyValidator },
];

export type ValidationReport = {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  byValidator: Record<string, number>;
};

export function runAllValidators(ctx: ValidatorContext): ValidationReport {
  const allIssues: ValidationIssue[] = [];
  const byValidator: Record<string, number> = {};

  for (const v of ALL_VALIDATORS) {
    try {
      const issues = v.fn(ctx);
      byValidator[v.name] = issues.length;
      allIssues.push(...issues);
    } catch (e) {
      console.error(`[validators] ${v.name} threw:`, e);
      byValidator[v.name] = 0;
    }
  }

  return {
    issues: allIssues,
    errorCount: allIssues.filter((i) => i.severity === 'error').length,
    warningCount: allIssues.filter((i) => i.severity === 'warning').length,
    infoCount: allIssues.filter((i) => i.severity === 'info').length,
    byValidator,
  };
}

export * from './types';
export { structuralValidator } from './structural-validator';
export { quantityValidator } from './quantity-validator';
export { priceValidator } from './price-validator';
export { completenessValidator } from './completeness-validator';
export { wizardConsistencyValidator } from './wizard-consistency-validator';
