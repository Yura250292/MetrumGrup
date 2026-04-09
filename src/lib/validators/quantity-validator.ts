/**
 * Quantity validator: cross-checks item quantities against ProjectFacts.
 *
 * Rules:
 *   • outlets in estimate must be within ±30% of ProjectFacts.electrical.outlets;
 *   • switches and lightPoints similarly;
 *   • tile area must be within ±20% of ProjectFacts.finishing.tileAreaM2;
 *   • per-square-metre item density must be sane (0.3–3.0 items/m²).
 */

import type { Validator } from './types';

const TOKEN_OUTLET = ['розетк'];
const TOKEN_SWITCH = ['вимикач'];
const TOKEN_LIGHT = ['світильник', 'point освітлення', 'led-точк'];
const TOKEN_TILE = ['плитк', 'tile'];

function sumByTokens(items: any[], tokens: string[]): number {
  return items.reduce((sum, item) => {
    const desc = (item.description || '').toLowerCase();
    if (tokens.some((t) => desc.includes(t))) {
      const q = Number(item.quantity ?? 0);
      return sum + (Number.isFinite(q) ? q : 0);
    }
    return sum;
  }, 0);
}

function flattenItems(estimate: any): any[] {
  return (estimate.sections ?? []).flatMap((s: any) => s.items ?? []);
}

export const quantityValidator: Validator = ({ estimate, facts }) => {
  const issues: ReturnType<Validator> = [];
  if (!facts) return issues;

  const items = flattenItems(estimate);
  const area = facts.area?.value ?? 0;

  const checks: Array<{
    code: string;
    label: string;
    expected: number | undefined;
    actual: number;
    tolerance: number;
  }> = [
    {
      code: 'OUTLET_COUNT_MISMATCH',
      label: 'Розетки',
      expected: facts.electrical?.outlets?.value,
      actual: sumByTokens(items, TOKEN_OUTLET),
      tolerance: 0.3,
    },
    {
      code: 'SWITCH_COUNT_MISMATCH',
      label: 'Вимикачі',
      expected: facts.electrical?.switches?.value,
      actual: sumByTokens(items, TOKEN_SWITCH),
      tolerance: 0.3,
    },
    {
      code: 'LIGHT_POINT_MISMATCH',
      label: 'Точки освітлення',
      expected: facts.electrical?.lightPoints?.value,
      actual: sumByTokens(items, TOKEN_LIGHT),
      tolerance: 0.3,
    },
    {
      code: 'TILE_AREA_MISMATCH',
      label: 'Площа плитки',
      expected: facts.finishing?.tileAreaM2?.value,
      actual: sumByTokens(items, TOKEN_TILE),
      tolerance: 0.2,
    },
  ];

  for (const check of checks) {
    if (!check.expected || check.expected <= 0) continue;
    if (check.actual === 0) {
      issues.push({
        severity: 'warning',
        code: check.code,
        message: `${check.label}: у wizard ${check.expected}, у кошторисі 0 — нічого не знайдено`,
        details: { expected: check.expected, actual: 0 },
      });
      continue;
    }
    const diffRatio = Math.abs(check.actual - check.expected) / check.expected;
    if (diffRatio > check.tolerance) {
      issues.push({
        severity: 'warning',
        code: check.code,
        message:
          `${check.label}: у wizard ${check.expected}, у кошторисі ${check.actual} ` +
          `(розбіжність ${(diffRatio * 100).toFixed(0)}% > ${check.tolerance * 100}%)`,
        details: { expected: check.expected, actual: check.actual, diffRatio },
      });
    }
  }

  // Item density per m².
  if (area > 0) {
    const totalItems = items.length;
    const density = totalItems / area;
    if (density < 0.3) {
      issues.push({
        severity: 'warning',
        code: 'ITEMS_TOO_FEW',
        message: `Лише ${totalItems} позицій на ${area} м² (щільність ${density.toFixed(2)}/м² < 0.3)`,
        details: { totalItems, area, density },
      });
    } else if (density > 3.0) {
      issues.push({
        severity: 'warning',
        code: 'ITEMS_TOO_MANY',
        message: `${totalItems} позицій на ${area} м² (щільність ${density.toFixed(2)}/м² > 3.0)`,
        details: { totalItems, area, density },
      });
    }
  }

  return issues;
};
