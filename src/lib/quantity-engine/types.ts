/**
 * Deterministic quantity engine — types.
 *
 * Phase 3 of the master plan: instead of asking the LLM to invent quantities
 * from text, we compute them from `ProjectFacts` using rule-based formulas.
 * The LLM keeps its role of generating unusual / project-specific items, but
 * for the canonical work packages (electrical, plumbing, finishing,
 * foundation, walls) the quantities are now reproducible.
 */

import type { ProjectFacts } from '../project-facts/types';
import type { WizardData } from '../wizard-types';
import type { EngineModifiers } from './modifiers';

export type EngineCategory =
  | 'electrical'
  | 'plumbing'
  | 'finishing'
  | 'foundation'
  | 'walls'
  | 'roofing'
  | 'hvac'
  | 'openings'
  | 'extras'
  | 'commercial';

export type EngineItemType = 'material' | 'labor' | 'equipment' | 'composite';

/**
 * A single deterministic line item produced by the engine.
 *
 * The engine emits geometry (`description`, `quantity`, `unit`) and a stable
 * `canonicalKey`. Pricing is left to the existing `enrichWithPrices` pipeline
 * (Prozorro → Google → catalog), so the engine plays nicely with the current
 * agents and avoids re-inventing pricing in this iteration.
 */
export type EngineItem = {
  /** Stable identifier used for de-duplication against LLM output. */
  canonicalKey: string;
  description: string;
  quantity: number;
  unit: string;
  itemType: EngineItemType;
  /** Optional human-readable trace of the formula that produced this item. */
  formula?: string;
  /** Inputs that fed the formula — useful for debugging and the review queue. */
  inputs?: Record<string, number | string | boolean>;
  /** Reserve / waste factor that was already applied (e.g. 1.07 for tile). */
  wasteFactor?: number;
};

export type EngineRuleContext = {
  facts: ProjectFacts;
  wizardData: WizardData;
  /** Computed geometry (perimeter, wallArea, ...) — built once per generation. */
  geometry: ProjectGeometry;
  /** Regional / object-class / quality / complexity multipliers (Phase 3.4). */
  modifiers: EngineModifiers;
};

export type ProjectGeometry = {
  /** Total floor area across all storeys (m²). */
  totalAreaM2: number;
  /** Number of storeys. */
  floors: number;
  /** Footprint area = totalArea / floors (m²). */
  footprintM2: number;
  /** Approximated rectangular perimeter from footprint (m). */
  perimeterM: number;
  /** Ceiling height (m). */
  ceilingHeightM: number;
  /** Inside wall area = perimeter * height * floors (m²). Excludes openings. */
  wallAreaM2: number;
};

/** A rule = a function that turns project context into a list of items. */
export type EngineRule = (ctx: EngineRuleContext) => EngineItem[];

export type EngineResult = {
  category: EngineCategory;
  items: EngineItem[];
  /** Rules that ran and produced no items (e.g. because the input was 0). */
  skippedRules: string[];
};
