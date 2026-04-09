/**
 * Rule-based validator types (Plan Stage 7).
 *
 * Each validator takes a normalized estimate snapshot + ProjectFacts and
 * returns a flat list of issues. Issues are categorised by severity, code
 * (machine-readable), human message, and optional pointer to the offending
 * section/item index. All validators are pure functions, easy to unit-test.
 */

import type { ProjectFacts } from '../project-facts/types';
import type { WizardData } from '../wizard-types';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  section?: string;
  itemIndex?: number;
  // Free-form structured details for the review queue.
  details?: Record<string, unknown>;
};

export type ValidatorItem = {
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  laborCost?: number;
  laborRate?: number;
  laborHours?: number;
  totalCost?: number;
  amount?: number;
  itemType?: string | null;
  engineKey?: string | null;
  notes?: string;
};

export type ValidatorSection = {
  title: string;
  items: ValidatorItem[];
  sectionTotal?: number;
};

export type ValidatorEstimate = {
  title?: string;
  sections: ValidatorSection[];
  summary?: {
    materialsCost?: number;
    laborCost?: number;
    overheadCost?: number;
    totalCost?: number;
  };
};

export type ValidatorContext = {
  estimate: ValidatorEstimate;
  facts?: ProjectFacts;
  wizardData?: WizardData;
};

export type Validator = (ctx: ValidatorContext) => ValidationIssue[];
