/**
 * Wall construction quantity rules.
 *
 * Inputs: wall material, wall area from geometry, insulation flags from
 * wizard's houseData/townhouseData.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import { GASBLOCK_GLUE_KG_PER_M2, GASBLOCK_PIECES_PER_M2, WASTE } from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function wallsRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const wizard = ctx.wizardData;
  const geom = ctx.geometry;

  const walls =
    wizard.houseData?.walls
    ?? wizard.townhouseData?.houseData?.walls;
  if (!walls) return items;

  const material = walls.material;
  const wallAreaM2 = geom.wallAreaM2;
  if (wallAreaM2 === 0 || !material) return items;

  // 1. Основний матеріал стін
  if (material === 'gasblock') {
    const blocks = wallAreaM2 * GASBLOCK_PIECES_PER_M2;
    items.push({
      canonicalKey: 'walls.gasblock',
      description: 'Газоблок D500 200×300×600',
      quantity: round(blocks * WASTE.gasblock),
      unit: 'шт',
      itemType: 'material',
      formula: `wallArea * ${GASBLOCK_PIECES_PER_M2} шт/м² * 1.05`,
      inputs: { wallAreaM2 },
      wasteFactor: WASTE.gasblock,
    });
    items.push({
      canonicalKey: 'walls.gasblock_glue',
      description: 'Клей для газоблоку',
      quantity: round(wallAreaM2 * GASBLOCK_GLUE_KG_PER_M2 * WASTE.glue),
      unit: 'кг',
      itemType: 'material',
      formula: `wallArea * ${GASBLOCK_GLUE_KG_PER_M2} кг/м² * 1.10`,
      inputs: { wallAreaM2 },
      wasteFactor: WASTE.glue,
    });
  } else if (material === 'brick') {
    items.push({
      canonicalKey: 'walls.brick',
      description: 'Цегла керамічна повнотіла',
      quantity: round(wallAreaM2 * 104 * WASTE.brick),
      unit: 'шт',
      itemType: 'material',
      formula: 'wallArea * 104 шт/м² * 1.05',
      inputs: { wallAreaM2 },
      wasteFactor: WASTE.brick,
    });
    items.push({
      canonicalKey: 'walls.mortar',
      description: 'Розчин мурувальний',
      quantity: round(wallAreaM2 * 0.04 * WASTE.glue),
      unit: 'м³',
      itemType: 'material',
      formula: 'wallArea * 0.04 м³/м² * 1.10',
    });
  } else if (material === 'wood') {
    // Грубо: для каркасу — пиломатеріал
    items.push({
      canonicalKey: 'walls.timber',
      description: 'Пиломатеріал хвойних порід (брус каркасу)',
      quantity: round(wallAreaM2 * 0.05),
      unit: 'м³',
      itemType: 'material',
      formula: 'wallArea * 0.05 м³/м²',
      inputs: { wallAreaM2 },
    });
  } else if (material === 'panel') {
    items.push({
      canonicalKey: 'walls.sip_panel',
      description: 'СІП-панель 174мм',
      quantity: round(wallAreaM2 * 1.05),
      unit: 'м²',
      itemType: 'material',
      wasteFactor: 1.05,
    });
  } else if (material === 'monolith') {
    items.push({
      canonicalKey: 'walls.concrete_walls',
      description: 'Бетон В25 (монолітні стіни)',
      quantity: round(wallAreaM2 * 0.2 * WASTE.concrete),
      unit: 'м³',
      itemType: 'material',
      formula: 'wallArea * 0.2м (товщина) * 1.04',
      wasteFactor: WASTE.concrete,
    });
  }

  // 2. Утеплення (якщо передбачено)
  if (walls.insulation) {
    const thicknessMm = walls.insulationThickness ?? 100;
    const insType = walls.insulationType ?? 'mineral';
    const description =
      insType === 'foam'
        ? `Пінопласт ${thicknessMm}мм`
        : insType === 'mineral'
        ? `Мінеральна вата ${thicknessMm}мм`
        : `Ековата ${thicknessMm}мм`;
    items.push({
      canonicalKey: `walls.insulation_${insType}`,
      description,
      quantity: round(wallAreaM2 * WASTE.insulation),
      unit: 'м²',
      itemType: 'material',
      formula: 'wallArea * 1.10',
      inputs: { wallAreaM2, thicknessMm },
      wasteFactor: WASTE.insulation,
    });
  }

  // 3. Перемички / армопояс (по периметру верхньої частини)
  const perimeter = geom.perimeterM;
  const floors = geom.floors;
  if (perimeter > 0 && floors > 0 && (material === 'gasblock' || material === 'brick')) {
    items.push({
      canonicalKey: 'walls.armored_belt',
      description: 'Армопояс по периметру',
      quantity: round(perimeter * floors),
      unit: 'м',
      itemType: 'composite',
      formula: 'perimeter * floors',
      inputs: { perimeter, floors },
    });
  }

  // 3b. Внутрішні перегородки. Площа орієнтовно = floorArea × 0.4 (середній коефіцієнт
  // для офісу/будинку — приблизно 40% площі підлоги припадає на перегородки).
  const partitionMaterial = walls.partitionMaterial;
  if (partitionMaterial && partitionMaterial !== 'same') {
    const partitionArea = round(geom.totalAreaM2 * 0.4);
    if (partitionMaterial === 'gypsum') {
      items.push({
        canonicalKey: 'walls.partition_gkl',
        description: 'Гіпсокартон вологостійкий 12.5мм (перегородки)',
        quantity: round(partitionArea * 2 * 1.10), // 2 шари + 10% запас
        unit: 'м²',
        itemType: 'material',
        formula: 'partitionArea × 2 шари × 1.10',
        inputs: { partitionArea },
      });
      items.push({
        canonicalKey: 'walls.partition_profile',
        description: 'Профіль металевий CW/UW для ГКЛ-перегородок',
        quantity: round(partitionArea * 2.4),
        unit: 'м',
        itemType: 'material',
        formula: 'partitionArea × 2.4 м/м²',
      });
      items.push({
        canonicalKey: 'walls.partition_insulation',
        description: 'Мінеральна вата 50мм у перегородки',
        quantity: round(partitionArea * 1.05),
        unit: 'м²',
        itemType: 'material',
      });
      items.push({
        canonicalKey: 'walls.partition_labor',
        description: 'Робота: монтаж ГКЛ-перегородок',
        quantity: partitionArea,
        unit: 'м²',
        itemType: 'labor',
      });
    } else if (partitionMaterial === 'gasblock') {
      items.push({
        canonicalKey: 'walls.partition_gasblock',
        description: 'Газоблок 100мм для перегородок',
        quantity: round(partitionArea * GASBLOCK_PIECES_PER_M2 * 0.5 * WASTE.gasblock),
        unit: 'шт',
        itemType: 'material',
      });
      items.push({
        canonicalKey: 'walls.partition_labor',
        description: 'Робота: мурування перегородок з газоблоку',
        quantity: partitionArea,
        unit: 'м²',
        itemType: 'labor',
      });
    } else if (partitionMaterial === 'brick') {
      items.push({
        canonicalKey: 'walls.partition_brick',
        description: 'Цегла керамічна (перегородки 1/2 цегли)',
        quantity: round(partitionArea * 52 * WASTE.brick), // половинна кладка
        unit: 'шт',
        itemType: 'material',
      });
      items.push({
        canonicalKey: 'walls.partition_labor',
        description: 'Робота: мурування цегляних перегородок',
        quantity: partitionArea,
        unit: 'м²',
        itemType: 'labor',
      });
    }
  }

  // 4. Робота — мурування / монтаж стін
  items.push({
    canonicalKey: 'walls.masonry_labor',
    description: `Робота: мурування стін (${material})`,
    quantity: round(wallAreaM2),
    unit: 'м²',
    itemType: 'labor',
    inputs: { wallAreaM2 },
  });

  return items;
}
