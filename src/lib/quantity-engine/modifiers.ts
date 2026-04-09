/**
 * Regional and object-class modifiers for the quantity engine.
 *
 * Plan 3.4: instead of hard-wiring "+10% if commercial" into individual rule
 * files, we centralise the multipliers here and apply them at engine entry.
 *
 * Currently we expose four kinds of modifier:
 *   • objectClass — house / townhouse / apartment / office / commercial
 *   • workScope — new construction vs reconstruction vs renovation
 *   • qualityTier — economy / standard / premium / luxury
 *   • complexity — simple / standard / complex (taken from terrain + slopes)
 *
 * Each rule file can opt in by reading `ctx.modifiers` and multiplying its
 * outputs. For now we apply two cross-cutting multipliers automatically inside
 * `applyModifiers()`:
 *   • Material quantities are scaled by qualityTier waste (premium = +5%
 *     extra over the static waste factor, luxury = +10%).
 *   • Labor units are scaled by complexity (complex = ×1.20).
 */

import type { EngineItem } from './types';
import type { WizardData } from '../wizard-types';
import type { ProjectFacts } from '../project-facts/types';

export type ObjectClass =
  | 'house'
  | 'townhouse'
  | 'apartment'
  | 'office'
  | 'commercial'
  | 'other';

export type WorkScopeClass =
  | 'new_construction'
  | 'reconstruction'
  | 'renovation'
  | 'other';

export type QualityTier = 'economy' | 'standard' | 'premium' | 'luxury';
export type Complexity = 'simple' | 'standard' | 'complex';

export type EngineModifiers = {
  objectClass: ObjectClass;
  workScope: WorkScopeClass;
  qualityTier: QualityTier;
  complexity: Complexity;
  /** Multiplier applied to all material quantities. */
  materialMultiplier: number;
  /** Multiplier applied to all labor quantities. */
  laborMultiplier: number;
};

const DEFAULT_MODIFIERS: EngineModifiers = {
  objectClass: 'other',
  workScope: 'other',
  qualityTier: 'standard',
  complexity: 'standard',
  materialMultiplier: 1.0,
  laborMultiplier: 1.0,
};

function mapObjectClass(t: WizardData['objectType'] | undefined): ObjectClass {
  if (!t) return 'other';
  switch (t) {
    case 'house':
    case 'townhouse':
    case 'apartment':
    case 'office':
    case 'commercial':
      return t;
    default:
      return 'other';
  }
}

function mapWorkScope(s: WizardData['workScope'] | undefined): WorkScopeClass {
  if (!s) return 'other';
  if (s === 'reconstruction') return 'reconstruction';
  if (s === 'renovation') return 'renovation';
  if (s === 'foundation_only' || s === 'foundation_walls' || s === 'foundation_walls_roof' || s === 'full_cycle') {
    return 'new_construction';
  }
  return 'other';
}

function mapQualityTier(b: WizardData['budgetRange'] | undefined): QualityTier {
  if (!b) return 'standard';
  switch (b) {
    case 'economy':
    case 'standard':
    case 'premium':
    case 'luxury':
      return b;
    default:
      return 'standard';
  }
}

function inferComplexity(wizard: WizardData): Complexity {
  // Steep slope, drainage required, or shallow groundwater push complexity up.
  const terrain = wizard.houseData?.terrain ?? wizard.townhouseData?.houseData?.terrain;
  if (terrain) {
    if (terrain.slope === 'steep') return 'complex';
    if (terrain.needsDrainage) return 'complex';
    if (terrain.groundwaterDepth === 'shallow') return 'complex';
  }
  // Multi-storey commercial = complex by default.
  if (wizard.objectType === 'commercial' && (wizard.floors ?? 1) > 1) return 'complex';
  return 'standard';
}

const QUALITY_MATERIAL_BUMP: Record<QualityTier, number> = {
  economy: 1.0,
  standard: 1.0,
  premium: 1.05,
  luxury: 1.10,
};

const COMPLEXITY_LABOR_BUMP: Record<Complexity, number> = {
  simple: 0.9,
  standard: 1.0,
  complex: 1.2,
};

const RECONSTRUCTION_LABOR_BUMP = 1.15;
const COMMERCIAL_MATERIAL_BUMP = 1.05;

export function buildModifiers(
  facts: ProjectFacts,
  wizard: WizardData
): EngineModifiers {
  const objectClass = mapObjectClass(wizard.objectType);
  const workScope = mapWorkScope(wizard.workScope);
  const qualityTier = mapQualityTier(wizard.budgetRange);
  const complexity = inferComplexity(wizard);

  let materialMultiplier = QUALITY_MATERIAL_BUMP[qualityTier];
  let laborMultiplier = COMPLEXITY_LABOR_BUMP[complexity];

  if (workScope === 'reconstruction') {
    laborMultiplier *= RECONSTRUCTION_LABOR_BUMP;
  }
  if (objectClass === 'commercial') {
    materialMultiplier *= COMMERCIAL_MATERIAL_BUMP;
  }

  return {
    objectClass,
    workScope,
    qualityTier,
    complexity,
    materialMultiplier,
    laborMultiplier,
  };
}

export function getDefaultModifiers(): EngineModifiers {
  return { ...DEFAULT_MODIFIERS };
}

/**
 * Apply modifiers to a list of engine items uniformly. Material rows are
 * scaled by `materialMultiplier`, labor rows by `laborMultiplier`. Composite
 * and equipment rows are left untouched (they are typically headcount or
 * informational items).
 */
export function applyModifiers(
  items: EngineItem[],
  mods: EngineModifiers
): EngineItem[] {
  if (mods.materialMultiplier === 1 && mods.laborMultiplier === 1) {
    return items;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return items.map((item) => {
    if (item.itemType === 'material') {
      return {
        ...item,
        quantity: round(item.quantity * mods.materialMultiplier),
        wasteFactor: (item.wasteFactor ?? 1) * mods.materialMultiplier,
      };
    }
    if (item.itemType === 'labor') {
      return {
        ...item,
        quantity: round(item.quantity * mods.laborMultiplier),
      };
    }
    return item;
  });
}
