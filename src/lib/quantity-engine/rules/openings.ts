/**
 * Openings (windows + doors) quantity rules.
 *
 * Inputs:
 *   - openings.windowsCount + windowsTotalAreaM2 + windowsType + windowsGlazing
 *   - openings.doorsEntrance + doorsInterior
 *
 * Outputs: вікна, підвіконня, відкоси, двері вхідні, двері міжкімнатні.
 */

import type { EngineItem, EngineRuleContext } from '../types';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function openingsRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;

  const windowsCount = facts.openings?.windowsCount?.value ?? 0;
  const windowsArea = facts.openings?.windowsTotalAreaM2?.value ?? 0;
  const windowsType = facts.openings?.windowsType?.value;
  const windowsGlazing = facts.openings?.windowsGlazing?.value;
  const doorsEntrance = facts.openings?.doorsEntrance?.value ?? 0;
  const doorsInterior = facts.openings?.doorsInterior?.value ?? 0;

  // 1. Вікна (за типом + склінням)
  if (windowsCount > 0) {
    const avgArea = windowsArea > 0 ? windowsArea / windowsCount : 1.5;
    const totalArea = windowsArea > 0 ? windowsArea : windowsCount * avgArea;
    let description = 'Металопластикове вікно';
    if (windowsType === 'wood') description = 'Дерев\'яне вікно (євростандарт)';
    else if (windowsType === 'aluminum') description = 'Алюмінієве вікно';
    if (windowsGlazing === 'triple') description += ' (3-камерне склопакет)';
    else if (windowsGlazing === 'double') description += ' (2-камерне склопакет)';
    else description += ' (1-камерне склопакет)';

    items.push({
      canonicalKey: 'openings.windows',
      description,
      quantity: round(totalArea),
      unit: 'м²',
      itemType: 'material',
      formula: `windowsCount × avgArea (${avgArea.toFixed(1)} м²)`,
      inputs: { windowsCount, totalArea },
    });
    items.push({
      canonicalKey: 'openings.window_sill',
      description: 'Підвіконня ПВХ 200мм',
      quantity: windowsCount,
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'openings.window_slope',
      description: 'Відкос ПВХ для вікна (комплект)',
      quantity: windowsCount,
      unit: 'компл',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'openings.window_install_labor',
      description: 'Робота: монтаж вікна з відкосами',
      quantity: windowsCount,
      unit: 'шт',
      itemType: 'labor',
    });
  }

  // 2. Вхідні двері
  if (doorsEntrance > 0) {
    items.push({
      canonicalKey: 'openings.entrance_door',
      description: 'Двері вхідні металеві з утепленням',
      quantity: doorsEntrance,
      unit: 'шт',
      itemType: 'equipment',
      inputs: { doorsEntrance },
    });
    items.push({
      canonicalKey: 'openings.entrance_door_install_labor',
      description: 'Робота: монтаж вхідних дверей',
      quantity: doorsEntrance,
      unit: 'шт',
      itemType: 'labor',
    });
  }

  // 3. Міжкімнатні двері
  if (doorsInterior > 0) {
    items.push({
      canonicalKey: 'openings.interior_door',
      description: 'Двері міжкімнатні MDF (полотно + коробка + лиштва)',
      quantity: doorsInterior,
      unit: 'компл',
      itemType: 'material',
      inputs: { doorsInterior },
    });
    items.push({
      canonicalKey: 'openings.interior_door_install_labor',
      description: 'Робота: монтаж міжкімнатних дверей',
      quantity: doorsInterior,
      unit: 'шт',
      itemType: 'labor',
    });
  }

  return items;
}
