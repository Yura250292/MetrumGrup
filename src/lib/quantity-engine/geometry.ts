/**
 * Geometry helpers for the quantity engine.
 *
 * Most projects come in with just `area` and `floors` from the wizard, no
 * explicit perimeter or wall area. We approximate by treating each storey as
 * a square footprint — good enough for material take-offs that are accurate
 * to ~5%, which is well below the natural noise of catalog pricing.
 */

import type { ProjectFacts } from '../project-facts/types';
import type { WizardData } from '../wizard-types';
import type { ProjectGeometry } from './types';

const DEFAULT_CEILING_HEIGHT_M = 2.7;

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Approximated perimeter of a square footprint of `area` square metres. */
export function squarePerimeter(areaM2: number): number {
  if (areaM2 <= 0) return 0;
  return 4 * Math.sqrt(areaM2);
}

/**
 * Build a `ProjectGeometry` snapshot from `ProjectFacts` (preferred) and
 * `WizardData` (fallback). All numbers are derived once per generation and
 * passed to every rule.
 */
export function computeGeometry(
  facts: ProjectFacts,
  wizardData: WizardData
): ProjectGeometry {
  const totalAreaM2 = facts.area.value > 0
    ? facts.area.value
    : (readNumber(wizardData.totalArea) ?? 0);

  const floors = facts.floors?.value ?? readNumber(wizardData.floors) ?? 1;

  const ceilingHeightM = facts.ceilingHeight?.value
    ?? readNumber(wizardData.ceilingHeight)
    ?? DEFAULT_CEILING_HEIGHT_M;

  const footprintM2 = floors > 0 ? totalAreaM2 / floors : totalAreaM2;
  const perimeterM = squarePerimeter(footprintM2);
  const wallAreaM2 = perimeterM * ceilingHeightM * floors;

  return {
    totalAreaM2,
    floors,
    footprintM2,
    perimeterM,
    ceilingHeightM,
    wallAreaM2,
  };
}
