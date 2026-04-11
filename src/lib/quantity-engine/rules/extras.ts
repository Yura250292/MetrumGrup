/**
 * Extras quantity rules — basement / attic / garage.
 *
 * Inputs (тільки для будинку/таунхауса):
 *   - extras.hasBasement + basementAreaM2
 *   - extras.hasAttic + atticAreaM2
 *   - extras.hasGarage + garageAreaM2 + garageType
 *
 * Outputs: гідроізоляція + дренаж підвалу, утеплення мансарди,
 * гаражні ворота + утеплення гаража.
 */

import type { EngineItem, EngineRuleContext } from '../types';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function extrasRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;

  const hasBasement = facts.extras?.hasBasement?.value ?? false;
  const basementArea = facts.extras?.basementAreaM2?.value ?? 0;
  const hasAttic = facts.extras?.hasAttic?.value ?? false;
  const atticArea = facts.extras?.atticAreaM2?.value ?? 0;
  const hasGarage = facts.extras?.hasGarage?.value ?? false;
  const garageArea = facts.extras?.garageAreaM2?.value ?? 0;
  const garageType = facts.extras?.garageType?.value;

  // 1. Підвал
  if (hasBasement && basementArea > 0) {
    // Периметр підвалу ~ 4 × √area
    const basementPerimeter = 4 * Math.sqrt(basementArea);
    items.push({
      canonicalKey: 'extras.basement_waterproofing',
      description: 'Гідроізоляція стін підвалу (бітумна обмазувальна)',
      quantity: round(basementPerimeter * 2.5), // висота 2.5м
      unit: 'м²',
      itemType: 'material',
      formula: 'perimeter × 2.5м висота',
      inputs: { basementArea, basementPerimeter },
    });
    items.push({
      canonicalKey: 'extras.basement_drainage',
      description: 'Дренажна труба перфорована Ø110 (по периметру підвалу)',
      quantity: round(basementPerimeter * 1.10),
      unit: 'м',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'extras.basement_drainage_gravel',
      description: 'Щебінь фракція 20-40 (під дренаж підвалу)',
      quantity: round(basementPerimeter * 0.3),
      unit: 'м³',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'extras.basement_floor',
      description: 'Бетонна підлога підвалу 100мм',
      quantity: round(basementArea * 0.1 * 1.04),
      unit: 'м³',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'extras.basement_labor',
      description: 'Робота: гідроізоляція + дренаж підвалу',
      quantity: round(basementArea),
      unit: 'м²',
      itemType: 'labor',
    });
  }

  // 2. Мансарда
  if (hasAttic && atticArea > 0) {
    items.push({
      canonicalKey: 'extras.attic_insulation',
      description: 'Мінеральна вата 200мм для мансарди (підсилене утеплення)',
      quantity: round(atticArea * 1.10),
      unit: 'м²',
      itemType: 'material',
      inputs: { atticArea },
    });
    items.push({
      canonicalKey: 'extras.attic_vapor_barrier',
      description: 'Пароізоляційна плівка для мансарди',
      quantity: round(atticArea * 1.15),
      unit: 'м²',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'extras.attic_drywall',
      description: 'Гіпсокартон для підшивки мансарди',
      quantity: round(atticArea * 1.10),
      unit: 'м²',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'extras.attic_labor',
      description: 'Робота: утеплення + підшивка мансарди',
      quantity: round(atticArea),
      unit: 'м²',
      itemType: 'labor',
    });
  }

  // 3. Гараж
  if (hasGarage && garageArea > 0) {
    items.push({
      canonicalKey: 'extras.garage_door',
      description: 'Ворота секційні гаражні з електроприводом',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
      inputs: { garageArea, garageType: garageType ?? 'attached' },
    });
    items.push({
      canonicalKey: 'extras.garage_floor',
      description: 'Бетонна підлога гаража 150мм армована',
      quantity: round(garageArea * 0.15 * 1.04),
      unit: 'м³',
      itemType: 'material',
    });
    if (garageType === 'detached') {
      // Окремий гараж потребує власних стін
      const garagePerimeter = 4 * Math.sqrt(garageArea);
      items.push({
        canonicalKey: 'extras.garage_walls',
        description: 'Газоблок D500 (стіни окремого гаража)',
        quantity: round(garagePerimeter * 3 * 5.5 * 1.05), // висота 3м
        unit: 'шт',
        itemType: 'material',
      });
      items.push({
        canonicalKey: 'extras.garage_roof',
        description: 'Покрівля гаража (профнастил + крокви)',
        quantity: round(garageArea * 1.10),
        unit: 'м²',
        itemType: 'material',
      });
    }
    items.push({
      canonicalKey: 'extras.garage_labor',
      description: `Робота: облаштування гаража (${garageType})`,
      quantity: round(garageArea),
      unit: 'м²',
      itemType: 'labor',
    });
  }

  return items;
}
