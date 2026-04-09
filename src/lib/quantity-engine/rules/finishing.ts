/**
 * Finishing quantity rules.
 *
 * Inputs: tile area, laminate area (from facts), wall area (from geometry),
 * ceiling type, paint vs other.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import {
  DEFAULT_PAINT_COATS,
  PAINT_L_PER_M2_PER_COAT,
  PLASTER_KG_PER_M2_PER_MM,
  TILE_CONSUMPTION,
  WASTE,
} from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function finishingRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const wizard = ctx.wizardData;
  const geom = ctx.geometry;

  const wallArea = geom.wallAreaM2;
  const floorArea = geom.totalAreaM2;
  const ceilingArea = geom.totalAreaM2;

  const tileArea =
    facts.finishing?.tileAreaM2?.value
    ?? Number(wizard.finishing?.walls?.tileArea ?? 0)
    ?? 0;
  const laminateArea =
    facts.finishing?.laminateAreaM2?.value
    ?? Number(wizard.finishing?.flooring?.laminate ?? 0)
    ?? 0;
  const wallMaterial = wizard.finishing?.walls?.material;
  const ceilingType = wizard.finishing?.ceiling?.type;

  // 1. Грунтовка стін
  if (wallArea > 0) {
    items.push({
      canonicalKey: 'finishing.primer_walls',
      description: 'Грунтовка універсальна (стіни)',
      quantity: round(wallArea * 0.3 * WASTE.primer),
      unit: 'л',
      itemType: 'material',
      formula: 'wallArea * 0.3 л/м² * 1.05',
      inputs: { wallArea },
      wasteFactor: WASTE.primer,
    });
  }

  // 2. Шпаклівка стін (товщина ~3 мм)
  if (wallArea > 0) {
    const kg = wallArea * 3 * PLASTER_KG_PER_M2_PER_MM * WASTE.spackle;
    items.push({
      canonicalKey: 'finishing.spackle_walls',
      description: 'Шпаклівка фінішна (стіни)',
      quantity: round(kg),
      unit: 'кг',
      itemType: 'material',
      formula: 'wallArea * 3мм * 1.8 кг/м²/мм * 1.05',
      inputs: { wallArea },
      wasteFactor: WASTE.spackle,
    });
  }

  // 3. Фарба стін (якщо вибрано)
  if (wallMaterial === 'paint' || wallMaterial === 'industrial_paint') {
    const litres = wallArea * PAINT_L_PER_M2_PER_COAT * DEFAULT_PAINT_COATS * WASTE.paint;
    items.push({
      canonicalKey: 'finishing.paint_walls',
      description: 'Фарба інтер\'єрна (стіни, 2 шари)',
      quantity: round(litres),
      unit: 'л',
      itemType: 'material',
      formula: 'wallArea * 0.15 л/м² * 2 шари * 1.05',
      inputs: { wallArea },
      wasteFactor: WASTE.paint,
    });
  }

  // 4. Плитка
  if (tileArea > 0) {
    const tileM2 = round(tileArea * WASTE.tile);
    items.push({
      canonicalKey: 'finishing.tile_material',
      description: 'Плитка керамічна',
      quantity: tileM2,
      unit: 'м²',
      itemType: 'material',
      formula: 'tileArea * 1.07',
      inputs: { tileArea },
      wasteFactor: WASTE.tile,
    });
    items.push({
      canonicalKey: 'finishing.tile_glue',
      description: 'Клей плитковий',
      quantity: round(tileArea * TILE_CONSUMPTION.glueKgPerM2 * WASTE.glue),
      unit: 'кг',
      itemType: 'material',
      formula: 'tileArea * 5 кг/м² * 1.10',
      inputs: { tileArea },
      wasteFactor: WASTE.glue,
    });
    items.push({
      canonicalKey: 'finishing.tile_grout',
      description: 'Затирка для швів',
      quantity: round(tileArea * TILE_CONSUMPTION.groutKgPerM2),
      unit: 'кг',
      itemType: 'material',
      formula: 'tileArea * 0.5 кг/м²',
    });
    items.push({
      canonicalKey: 'finishing.tile_install_labor',
      description: 'Робота: укладання плитки',
      quantity: tileArea,
      unit: 'м²',
      itemType: 'labor',
    });
  }

  // 5. Ламінат
  if (laminateArea > 0) {
    items.push({
      canonicalKey: 'finishing.laminate_material',
      description: 'Ламінат 32 клас',
      quantity: round(laminateArea * WASTE.laminate),
      unit: 'м²',
      itemType: 'material',
      formula: 'laminateArea * 1.10',
      inputs: { laminateArea },
      wasteFactor: WASTE.laminate,
    });
    items.push({
      canonicalKey: 'finishing.laminate_underlay',
      description: 'Підкладка під ламінат',
      quantity: round(laminateArea * WASTE.laminate),
      unit: 'м²',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'finishing.laminate_install_labor',
      description: 'Робота: укладання ламінату',
      quantity: laminateArea,
      unit: 'м²',
      itemType: 'labor',
    });
  }

  // 6. Стеля — фарба
  if (ceilingType === 'paint' && ceilingArea > 0) {
    items.push({
      canonicalKey: 'finishing.paint_ceiling',
      description: 'Фарба стельна (2 шари)',
      quantity: round(ceilingArea * PAINT_L_PER_M2_PER_COAT * DEFAULT_PAINT_COATS * WASTE.paint),
      unit: 'л',
      itemType: 'material',
      formula: 'ceilingArea * 0.15 л/м² * 2 * 1.05',
      inputs: { ceilingArea },
    });
  }

  // 7. Стеля — гіпсокартон
  if (ceilingType === 'drywall' && ceilingArea > 0) {
    items.push({
      canonicalKey: 'finishing.drywall_ceiling',
      description: 'Гіпсокартон стельовий 9.5мм',
      quantity: round(ceilingArea * 1.10),
      unit: 'м²',
      itemType: 'material',
      formula: 'ceilingArea * 1.10',
      inputs: { ceilingArea },
    });
  }

  // 8. Робота: фарбування стін
  if (wallArea > 0 && (wallMaterial === 'paint' || wallMaterial === 'industrial_paint')) {
    items.push({
      canonicalKey: 'finishing.wall_paint_labor',
      description: 'Робота: фарбування стін',
      quantity: wallArea,
      unit: 'м²',
      itemType: 'labor',
    });
  }

  return items;
}
