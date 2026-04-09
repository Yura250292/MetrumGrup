/**
 * Plumbing quantity rules.
 *
 * Inputs: water/sewer points, total area (for route length), wizard's
 * water + sewerage type, hot water flag.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import { PLUMBING_ROUTE_M_PER_M2, WASTE } from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function plumbingRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const wizard = ctx.wizardData;

  const waterPoints = facts.plumbing?.waterPoints?.value ?? 0;
  const sewerPoints = facts.plumbing?.sewerPoints?.value ?? 0;
  const hasColdWater = !!wizard.utilities?.water?.coldWater;
  const hasHotWater = !!wizard.utilities?.water?.hotWater;
  const sewerageType = wizard.utilities?.sewerage?.type;
  const area = ctx.geometry.totalAreaM2;

  if (!hasColdWater && waterPoints === 0 && sewerPoints === 0) {
    return items;
  }

  // 1. Холодна вода: PEX-Al-PEX 16мм
  if (hasColdWater || waterPoints > 0) {
    const rawM = area * 5 * PLUMBING_ROUTE_M_PER_M2.water * 100; // ~5 м.п. на м² (грубий midpoint)
    const pipeM = round(Math.max(rawM, 10) * WASTE.pipe);
    items.push({
      canonicalKey: 'plumbing.cold_water_pipe',
      description: 'Труба PEX-AL-PEX 16мм (холодна вода)',
      quantity: pipeM,
      unit: 'м',
      itemType: 'material',
      formula: 'area * 5 м.п./м² * 1.15',
      inputs: { area },
      wasteFactor: WASTE.pipe,
    });
  }

  // 2. Гаряча вода — окремий контур
  if (hasHotWater) {
    const rawM = area * 4 * PLUMBING_ROUTE_M_PER_M2.water * 100;
    const pipeM = round(Math.max(rawM, 8) * WASTE.pipe);
    items.push({
      canonicalKey: 'plumbing.hot_water_pipe',
      description: 'Труба PEX-AL-PEX 16мм з ізоляцією (гаряча вода)',
      quantity: pipeM,
      unit: 'м',
      itemType: 'material',
      formula: 'area * 4 м.п./м² * 1.15',
      inputs: { area },
      wasteFactor: WASTE.pipe,
    });
  }

  // 3. Каналізація — D50 для умивальників, D110 для унітазів
  if (sewerageType || sewerPoints > 0) {
    const rawM50 = area * 3 * PLUMBING_ROUTE_M_PER_M2.sewer * 100;
    const m50 = round(Math.max(rawM50, 6) * WASTE.pipe);
    items.push({
      canonicalKey: 'plumbing.sewer_pipe_50',
      description: 'Труба каналізаційна D50',
      quantity: m50,
      unit: 'м',
      itemType: 'material',
      formula: 'area * 3 м.п./м² * 1.15',
      inputs: { area },
      wasteFactor: WASTE.pipe,
    });
    items.push({
      canonicalKey: 'plumbing.sewer_pipe_110',
      description: 'Труба каналізаційна D110',
      quantity: round(Math.max(area * 0.05, 5) * WASTE.pipe),
      unit: 'м',
      itemType: 'material',
      wasteFactor: WASTE.pipe,
    });
  }

  // 4. Фітинги — комплект на ~5 м труби
  const totalPipe = items
    .filter((i) => i.unit === 'м')
    .reduce((s, i) => s + i.quantity, 0);
  if (totalPipe > 0) {
    items.push({
      canonicalKey: 'plumbing.fittings_kit',
      description: 'Комплект фітингів (трійники, муфти, кутники)',
      quantity: Math.ceil(totalPipe / 5),
      unit: 'компл',
      itemType: 'material',
      formula: 'ceil(totalPipe / 5)',
      inputs: { totalPipe },
    });
  }

  // 5. Запірна арматура (крани) — мінімум 2 + по 1 на kожні 30м труби
  if (totalPipe > 0) {
    const valves = 2 + Math.ceil(totalPipe / 30);
    items.push({
      canonicalKey: 'plumbing.shutoff_valve',
      description: 'Кран кульовий 1/2"',
      quantity: valves,
      unit: 'шт',
      itemType: 'material',
      formula: '2 + ceil(totalPipe / 30)',
    });
  }

  // 6. Робота — монтаж сантехнічної точки
  const wetPoints = waterPoints + sewerPoints;
  if (wetPoints > 0) {
    items.push({
      canonicalKey: 'plumbing.point_install_labor',
      description: 'Монтаж сантехнічної точки (підведення води/каналізації)',
      quantity: wetPoints,
      unit: 'точка',
      itemType: 'labor',
      inputs: { waterPoints, sewerPoints },
    });
  }

  return items;
}
