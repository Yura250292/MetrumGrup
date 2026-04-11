/**
 * Commercial-specific quantity rules.
 *
 * Inputs:
 *   - commercial.purpose (shop/restaurant/warehouse/production/showroom)
 *   - commercial.floorType + floorAntiStatic + floorLoadCapacity
 *   - commercial.fireRating
 *   - commercial.hvac
 *   - commercial.heavyDutyElectrical
 *   - commercial.surveillance
 *   - commercial.accessControl
 *
 * Outputs: промислова підлога, протипожежна сертифікація, промислова HVAC,
 * відеоспостереження, контроль доступу.
 */

import type { EngineItem, EngineRuleContext } from '../types';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function commercialRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const area = ctx.geometry.totalAreaM2;

  const cd = facts.commercial;
  if (!cd) return items;

  const purpose = cd.purpose?.value;
  const floorType = cd.floorType?.value;
  const antiStatic = cd.floorAntiStatic?.value ?? false;
  const loadCapacity = cd.floorLoadCapacityKgM2?.value ?? 0;
  const fireRating = cd.fireRating?.value ?? false;
  const hvac = cd.hvac?.value ?? false;
  const heavyDutyElectrical = cd.heavyDutyElectrical?.value ?? false;
  const surveillance = cd.surveillance?.value ?? false;
  const accessControl = cd.accessControl?.value ?? false;

  // 1. Промислова підлога з антистатичним покриттям
  if (floorType === 'industrial' && area > 0) {
    items.push({
      canonicalKey: 'commercial.industrial_floor_topping',
      description: 'Топінг для промислової підлоги (зміцнювач + полірування)',
      quantity: round(area * 5), // ~5 кг/м²
      unit: 'кг',
      itemType: 'material',
      formula: 'area × 5 кг/м²',
      inputs: { area, loadCapacity },
    });
    items.push({
      canonicalKey: 'commercial.industrial_floor_labor',
      description: 'Робота: укладання промислової бетонної підлоги',
      quantity: area,
      unit: 'м²',
      itemType: 'labor',
    });
    if (antiStatic) {
      items.push({
        canonicalKey: 'commercial.antistatic_coating',
        description: 'Антистатичне покриття для промислової підлоги',
        quantity: round(area * 0.4),
        unit: 'кг',
        itemType: 'material',
        inputs: { area },
      });
    }
  }

  // 2. Протипожежна система
  if (fireRating && area > 0) {
    const sprinklerCount = Math.max(4, Math.ceil(area / 12));
    items.push({
      canonicalKey: 'commercial.fire_sprinkler',
      description: 'Спринклер протипожежний',
      quantity: sprinklerCount,
      unit: 'шт',
      itemType: 'material',
      formula: 'max(4, area/12)',
      inputs: { area },
    });
    items.push({
      canonicalKey: 'commercial.fire_pipe',
      description: 'Труба сталева DN50 для спринклерної системи',
      quantity: round(area * 0.3),
      unit: 'м',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.fire_pump',
      description: 'Насосна група протипожежна (з джокеєм)',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'commercial.fire_alarm',
      description: 'Прилад приймально-контрольний пожежний',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'commercial.fire_smoke_detector',
      description: 'Димовий сповіщувач (адресний)',
      quantity: Math.max(6, Math.ceil(area / 20)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.fire_evacuation_sign',
      description: 'Знак евакуації світловий',
      quantity: Math.max(2, Math.ceil(area / 100)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.fire_install_labor',
      description: 'Робота: монтаж + пусконалагодження протипожежної системи',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  }

  // 3. Промислова HVAC (припливно-витяжна для commercial)
  if (hvac && area > 0) {
    items.push({
      canonicalKey: 'commercial.industrial_ahu',
      description: `Припливно-витяжна установка промислова (${Math.ceil(area * 30)} м³/год)`,
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
      formula: 'area × 30 м³/год',
      inputs: { area },
    });
    items.push({
      canonicalKey: 'commercial.air_ducts_industrial',
      description: 'Повітроводи оцинковані прямокутні (промислові)',
      quantity: round(area * 0.6),
      unit: 'м²',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.hvac_install_labor',
      description: 'Робота: монтаж + пусконалагодження промислової HVAC',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  }

  // 4. Промислова електрика (трифазна, висока потужність)
  if (heavyDutyElectrical && area > 0) {
    items.push({
      canonicalKey: 'commercial.industrial_panel',
      description: 'Силовий щит промисловий (3-фази, до 100А)',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'commercial.industrial_outlets',
      description: 'Розетка промислова 32А (CEE 7-pin)',
      quantity: Math.max(4, Math.ceil(area / 50)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.industrial_cable',
      description: 'Кабель силовий ВВГ 5×16 (для промислової електрики)',
      quantity: round(area * 0.8),
      unit: 'м',
      itemType: 'material',
    });
  }

  // 5. Відеоспостереження
  if (surveillance && area > 0) {
    const camCount = Math.max(4, Math.ceil(area / 50));
    items.push({
      canonicalKey: 'commercial.cctv_camera',
      description: 'IP-камера 4MP з нічним режимом',
      quantity: camCount,
      unit: 'шт',
      itemType: 'material',
      formula: 'max(4, area/50)',
      inputs: { area },
    });
    items.push({
      canonicalKey: 'commercial.cctv_nvr',
      description: 'NVR відеореєстратор 8-канальний з HDD 4TB',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'commercial.cctv_cable',
      description: 'Кабель UTP CAT6 для CCTV',
      quantity: round(camCount * 30),
      unit: 'м',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.cctv_install_labor',
      description: 'Робота: монтаж + налаштування системи відеоспостереження',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  }

  // 6. Контроль доступу
  if (accessControl) {
    items.push({
      canonicalKey: 'commercial.access_control_reader',
      description: 'Зчитувач карток доступу (RFID)',
      quantity: Math.max(2, Math.ceil(area / 200)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.access_control_lock',
      description: 'Електромагнітний замок 280 кг',
      quantity: Math.max(2, Math.ceil(area / 200)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'commercial.access_control_panel',
      description: 'Контролер доступу 2-дверний',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
  }

  // 7. Спеціфіка по purpose
  if (purpose === 'restaurant') {
    items.push({
      canonicalKey: 'commercial.kitchen_hood',
      description: 'Витяжний зонт кухонний нержавіючий',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'commercial.kitchen_grease_trap',
      description: 'Жировловлювач 50л',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
  } else if (purpose === 'warehouse') {
    items.push({
      canonicalKey: 'commercial.warehouse_lighting',
      description: 'Світильник промисловий LED 100W',
      quantity: Math.max(4, Math.ceil(area / 30)),
      unit: 'шт',
      itemType: 'material',
    });
  }

  return items;
}
