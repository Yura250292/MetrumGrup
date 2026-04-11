/**
 * Roofing quantity rules.
 *
 * Inputs from ProjectFacts.roof:
 *   - type (pitched/flat/mansard/combined)
 *   - material (metal_tile/soft_tile/profiled_sheet/ceramic/slate)
 *   - pitchAngleDeg
 *   - insulation + insulationThicknessMm
 *   - attic (cold/warm/living)
 *   - gutterSystem
 *   - roofWindows
 *
 * Outputs: roofing material, обрешітка, стропила, утеплення, водостічна
 * система, мансардні вікна. Уся геометрія базується на footprintM2 × cos(pitch)
 * для приблизного перетворення горизонтальної площі на похилу.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import { WASTE } from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function roofingRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const wizard = ctx.wizardData;
  const geom = ctx.geometry;

  const factsRoof = facts.roof;
  const wizardRoof =
    wizard.houseData?.roof
    ?? wizard.townhouseData?.houseData?.roof;
  if (!factsRoof && !wizardRoof) return items;

  const roofType = factsRoof?.type?.value ?? wizardRoof?.type;
  const roofMaterial = factsRoof?.material?.value ?? wizardRoof?.material;
  const pitchAngle = factsRoof?.pitchAngleDeg?.value ?? wizardRoof?.pitchAngle ?? 30;
  const insulation = factsRoof?.insulation?.value ?? wizardRoof?.insulation ?? false;
  const insulationThickness = factsRoof?.insulationThicknessMm?.value
    ?? wizardRoof?.insulationThickness ?? 150;
  const attic = factsRoof?.attic?.value ?? wizardRoof?.attic;
  const gutterSystem = factsRoof?.gutterSystem?.value ?? wizardRoof?.gutterSystem ?? true;
  const roofWindows = factsRoof?.roofWindows?.value ?? wizardRoof?.roofWindows ?? 0;

  if (!roofType || !roofMaterial) return items;

  // Apparent (sloped) roof area = footprint / cos(pitch).
  // Для пласкої покрівлі pitchAngle ≈ 0 і косинус ≈ 1.
  const pitchRad = (pitchAngle * Math.PI) / 180;
  const cosP = Math.max(0.5, Math.cos(pitchRad)); // floor at 60° to prevent overflow
  const slopedAreaM2 = geom.footprintM2 / cosP;

  // 1. Покрівельний матеріал
  if (roofMaterial === 'metal_tile') {
    items.push({
      canonicalKey: 'roofing.metal_tile',
      description: 'Металочерепиця 0.5мм (з покриттям)',
      quantity: round(slopedAreaM2 * 1.10),
      unit: 'м²',
      itemType: 'material',
      formula: 'slopedArea × 1.10 запас на нахили',
      inputs: { slopedAreaM2, pitchAngle },
      wasteFactor: 1.10,
    });
  } else if (roofMaterial === 'soft_tile') {
    items.push({
      canonicalKey: 'roofing.soft_tile',
      description: 'Бітумна (мʼяка) черепиця',
      quantity: round(slopedAreaM2 * 1.15),
      unit: 'м²',
      itemType: 'material',
      wasteFactor: 1.15,
    });
    items.push({
      canonicalKey: 'roofing.osb',
      description: 'OSB 12мм (суцільне покриття під бітумну)',
      quantity: round(slopedAreaM2 * 1.05),
      unit: 'м²',
      itemType: 'material',
    });
  } else if (roofMaterial === 'profiled_sheet') {
    items.push({
      canonicalKey: 'roofing.profiled_sheet',
      description: 'Профнастил ПК-20 (оцинкований)',
      quantity: round(slopedAreaM2 * 1.10),
      unit: 'м²',
      itemType: 'material',
      wasteFactor: 1.10,
    });
  } else if (roofMaterial === 'ceramic') {
    items.push({
      canonicalKey: 'roofing.ceramic_tile',
      description: 'Керамічна черепиця',
      quantity: round(slopedAreaM2 * 1.10),
      unit: 'м²',
      itemType: 'material',
      wasteFactor: 1.10,
    });
  } else if (roofMaterial === 'slate') {
    items.push({
      canonicalKey: 'roofing.slate',
      description: 'Шифер хвилястий',
      quantity: round(slopedAreaM2 * 1.10),
      unit: 'м²',
      itemType: 'material',
    });
  }

  // 2. Стропильна система (тільки для скатних дахів)
  if (roofType !== 'flat' && slopedAreaM2 > 0) {
    items.push({
      canonicalKey: 'roofing.rafters',
      description: 'Брус хвойний 50×150 мм (стропила)',
      quantity: round(slopedAreaM2 * 0.05),
      unit: 'м³',
      itemType: 'material',
      formula: 'slopedArea × 0.05 м³/м²',
    });
    items.push({
      canonicalKey: 'roofing.battens',
      description: 'Дошка обрешітки 25×100 мм',
      quantity: round(slopedAreaM2 * 0.025),
      unit: 'м³',
      itemType: 'material',
    });
  }

  // 3. Гідроізоляція + пароізоляція
  if (slopedAreaM2 > 0) {
    items.push({
      canonicalKey: 'roofing.waterproofing_membrane',
      description: 'Гідроізоляційна мембрана покрівельна',
      quantity: round(slopedAreaM2 * 1.15),
      unit: 'м²',
      itemType: 'material',
    });
    if (insulation) {
      items.push({
        canonicalKey: 'roofing.vapor_barrier',
        description: 'Пароізоляційна плівка',
        quantity: round(slopedAreaM2 * 1.15),
        unit: 'м²',
        itemType: 'material',
      });
    }
  }

  // 4. Утеплення (за товщиною)
  if (insulation && slopedAreaM2 > 0) {
    items.push({
      canonicalKey: 'roofing.insulation',
      description: `Мінеральна вата ${insulationThickness}мм (покрівля)`,
      quantity: round(slopedAreaM2 * WASTE.insulation),
      unit: 'м²',
      itemType: 'material',
      inputs: { slopedAreaM2, insulationThickness },
      wasteFactor: WASTE.insulation,
    });
  }

  // 5. Водостічна система
  if (gutterSystem) {
    // Приблизно perimeter periметр × 1.0 = довжина жолобу
    items.push({
      canonicalKey: 'roofing.gutter',
      description: 'Жолоб водостічний пластиковий 125мм',
      quantity: round(geom.perimeterM),
      unit: 'м',
      itemType: 'material',
      inputs: { perimeterM: geom.perimeterM },
    });
    // Кількість водостоків ~ перимitr / 8 м
    const downpipes = Math.max(2, Math.ceil(geom.perimeterM / 8));
    items.push({
      canonicalKey: 'roofing.downpipe',
      description: 'Труба водостічна 100мм + кріплення',
      quantity: downpipes,
      unit: 'шт',
      itemType: 'material',
      formula: 'max(2, perimeter / 8)',
    });
  }

  // 6. Мансардні вікна
  if (roofWindows > 0) {
    items.push({
      canonicalKey: 'roofing.skylight',
      description: 'Мансардне вікно FAKRO 78×118 з окладом',
      quantity: roofWindows,
      unit: 'шт',
      itemType: 'equipment',
      inputs: { roofWindows },
    });
  }

  // 7. Тип мансарди → додаткові роботи для warm/living
  if (attic === 'warm' || attic === 'living') {
    items.push({
      canonicalKey: 'roofing.attic_drywall',
      description: 'Гіпсокартон підшивка мансарди (вологостійкий)',
      quantity: round(slopedAreaM2 * 0.7 * 1.10),
      unit: 'м²',
      itemType: 'material',
      formula: 'slopedArea × 0.7 (внутрішня поверхня) × 1.10',
    });
  }

  // 8. Робота: монтаж покрівлі
  if (slopedAreaM2 > 0) {
    items.push({
      canonicalKey: 'roofing.install_labor',
      description: `Робота: монтаж покрівлі (${roofMaterial})`,
      quantity: round(slopedAreaM2),
      unit: 'м²',
      itemType: 'labor',
    });
  }

  return items;
}
