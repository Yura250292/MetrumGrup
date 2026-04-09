/**
 * Foundation quantity rules.
 *
 * Inputs: foundation type / depth / width / waterproofing flags from wizard,
 * perimeter from geometry, groundwater level from facts.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import { REBAR_KG_PER_M3, WASTE } from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function foundationRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const wizard = ctx.wizardData;
  const geom = ctx.geometry;

  // Prefer ProjectFacts (Phase 3.2 expansion); fall back to raw wizard data.
  const factsFoundation = facts.foundation;
  const wizardFoundation =
    wizard.houseData?.foundation
    ?? wizard.townhouseData?.houseData?.foundation;
  if (!factsFoundation && !wizardFoundation) return items;

  const type =
    factsFoundation?.type?.value
    ?? wizardFoundation?.type
    ?? 'strip';
  const depthM =
    factsFoundation?.depthM?.value
    ?? readNumber(wizardFoundation?.depth)
    ?? 1.0;
  const widthM =
    factsFoundation?.widthM?.value
    ?? readNumber(wizardFoundation?.width)
    ?? 0.4;
  const waterproofing =
    factsFoundation?.waterproofing?.value
    ?? wizardFoundation?.waterproofing
    ?? false;
  const insulation =
    factsFoundation?.insulation?.value
    ?? wizardFoundation?.insulation
    ?? false;
  const perimeterM = geom.perimeterM;
  const footprintM2 = geom.footprintM2;

  if (perimeterM === 0 || footprintM2 === 0) return items;

  // 1. Об'єм бетону залежно від типу
  let concreteM3 = 0;
  if (type === 'strip') {
    concreteM3 = perimeterM * widthM * depthM;
  } else if (type === 'slab') {
    concreteM3 = footprintM2 * depthM;
  } else if (type === 'pile') {
    // приблизно — 1 паля на 5 м² + ростверк
    const piles = Math.ceil(footprintM2 / 5);
    const pileVol = piles * Math.PI * Math.pow(0.15, 2) * depthM;
    const grillage = perimeterM * widthM * 0.4;
    concreteM3 = pileVol + grillage;
  } else {
    // combined: rough mid
    concreteM3 = (perimeterM * widthM * depthM + footprintM2 * 0.2) / 2;
  }

  if (concreteM3 > 0) {
    items.push({
      canonicalKey: `foundation.concrete_${type}`,
      description: `Бетон В25 (фундамент ${type})`,
      quantity: round(concreteM3 * WASTE.concrete),
      unit: 'м³',
      itemType: 'material',
      formula:
        type === 'strip'
          ? 'perimeter * width * depth * 1.04'
          : type === 'slab'
          ? 'footprint * depth * 1.04'
          : 'piles + grillage',
      inputs: { perimeter: perimeterM, width: widthM, depth: depthM, footprint: footprintM2 },
      wasteFactor: WASTE.concrete,
    });
  }

  // 2. Арматура
  const rebarKg = concreteM3 * (REBAR_KG_PER_M3[type] ?? REBAR_KG_PER_M3.strip);
  if (rebarKg > 0) {
    items.push({
      canonicalKey: 'foundation.rebar',
      description: 'Арматура А500С Ø12-16',
      quantity: round(rebarKg * WASTE.rebar),
      unit: 'кг',
      itemType: 'material',
      formula: `concreteVol * ${REBAR_KG_PER_M3[type] ?? REBAR_KG_PER_M3.strip} кг/м³ * 1.13`,
      inputs: { concreteM3, type },
      wasteFactor: WASTE.rebar,
    });
  }

  // 3. Опалубка (тільки для стрічкового / комбінованого)
  if (type === 'strip' || type === 'combined') {
    const formworkM2 = perimeterM * 2 * depthM;
    items.push({
      canonicalKey: 'foundation.formwork',
      description: 'Опалубка дощата',
      quantity: round(formworkM2 * WASTE.formwork),
      unit: 'м²',
      itemType: 'material',
      formula: 'perimeter * 2 * depth * 1.10',
      inputs: { perimeter: perimeterM, depth: depthM },
      wasteFactor: WASTE.formwork,
    });
  }

  // 4. Гідроізоляція (горизонтальна)
  if (waterproofing) {
    const wpArea = type === 'slab' ? footprintM2 : perimeterM * widthM * 1.2;
    items.push({
      canonicalKey: 'foundation.waterproofing',
      description: 'Гідроізоляція рулонна (бітумна)',
      quantity: round(wpArea),
      unit: 'м²',
      itemType: 'material',
      inputs: { wpArea },
    });
  }

  // 5. Утеплення (XPS під плиту або бічне для стрічки)
  if (insulation) {
    const insArea = type === 'slab' ? footprintM2 : perimeterM * depthM;
    items.push({
      canonicalKey: 'foundation.insulation',
      description: 'Утеплювач XPS 50мм',
      quantity: round(insArea * WASTE.insulation),
      unit: 'м²',
      itemType: 'material',
      wasteFactor: WASTE.insulation,
    });
  }

  // 6. Дренаж (якщо УГВ < 2 м, обов'язково)
  const ugv = ctx.facts.geology?.groundwaterLevelM?.value;
  if (ugv !== undefined && ugv < 2) {
    items.push({
      canonicalKey: 'foundation.drainage_pipe',
      description: 'Дренажна труба перфорована Ø110',
      quantity: round(perimeterM * 1.1),
      unit: 'м',
      itemType: 'material',
      formula: 'perimeter * 1.1 (УГВ < 2м)',
      inputs: { perimeterM, ugv },
    });
    items.push({
      canonicalKey: 'foundation.drainage_gravel',
      description: 'Щебінь фракція 20-40 (під дренаж)',
      quantity: round(perimeterM * 0.3),
      unit: 'м³',
      itemType: 'material',
    });
  }

  // 7. Робота — заливка фундаменту
  if (concreteM3 > 0) {
    items.push({
      canonicalKey: 'foundation.pour_labor',
      description: 'Робота: заливка фундаменту',
      quantity: round(concreteM3),
      unit: 'м³',
      itemType: 'labor',
    });
  }

  return items;
}
