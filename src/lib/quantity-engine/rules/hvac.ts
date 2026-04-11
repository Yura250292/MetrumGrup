/**
 * HVAC quantity rules.
 *
 * Inputs:
 *   - heating.type (gas/electric/solid_fuel/heat_pump/none)
 *   - heating.radiators (count)
 *   - heating.underfloorAreaM2
 *   - heating.boilerPowerKw
 *   - heating.needsGasConnection + gasConnectionDistance
 *   - ventilation.natural/forced/recuperation
 *
 * Outputs: котел, радіатори, тепла підлога, газ-підведення, рекуператор.
 */

import type { EngineItem, EngineRuleContext } from '../types';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function hvacRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const area = ctx.geometry.totalAreaM2;

  const heatingType = facts.heating?.type?.value;
  const radiators = facts.heating?.radiators?.value ?? 0;
  const underfloorArea = facts.heating?.underfloorAreaM2?.value ?? 0;
  const boilerPower = facts.heating?.boilerPowerKw?.value ?? 0;
  const needsGasConnection = facts.heating?.needsGasConnection?.value ?? false;
  const gasConnectionDistance = facts.heating?.gasConnectionDistanceM?.value ?? 0;

  const ventNatural = facts.ventilation?.natural?.value ?? false;
  const ventForced = facts.ventilation?.forced?.value ?? false;
  const ventRecuperation = facts.ventilation?.recuperation?.value ?? false;

  // 1. Котел (за типом)
  if (heatingType === 'gas') {
    const power = boilerPower > 0 ? boilerPower : Math.max(12, Math.round(area / 10));
    items.push({
      canonicalKey: 'hvac.gas_boiler',
      description: `Котел газовий двоконтурний ${power} кВт (Vaillant/Bosch)`,
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
      inputs: { power, area },
    });
    items.push({
      canonicalKey: 'hvac.gas_boiler_chimney',
      description: 'Димохід коаксіальний для газового котла',
      quantity: 1,
      unit: 'компл',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.boiler_install_labor',
      description: 'Робота: монтаж + пусконалагодження газового котла',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  } else if (heatingType === 'electric') {
    const power = boilerPower > 0 ? boilerPower : Math.max(9, Math.round(area / 12));
    items.push({
      canonicalKey: 'hvac.electric_boiler',
      description: `Котел електричний ${power} кВт`,
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
      inputs: { power },
    });
    items.push({
      canonicalKey: 'hvac.boiler_install_labor',
      description: 'Робота: монтаж + підключення електрокотла',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  } else if (heatingType === 'heat_pump') {
    items.push({
      canonicalKey: 'hvac.heat_pump',
      description: 'Тепловий насос повітря-вода (зовнішній + внутрішній блок)',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'hvac.heat_pump_install_labor',
      description: 'Робота: монтаж + пусконалагодження теплового насоса',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  } else if (heatingType === 'solid_fuel') {
    items.push({
      canonicalKey: 'hvac.solid_fuel_boiler',
      description: 'Котел твердопаливний 25 кВт',
      quantity: 1,
      unit: 'шт',
      itemType: 'equipment',
    });
    items.push({
      canonicalKey: 'hvac.solid_fuel_chimney',
      description: 'Димохід нержавіючий для твердопаливного котла',
      quantity: 1,
      unit: 'компл',
      itemType: 'material',
    });
  }

  // 2. Радіатори
  if (radiators > 0) {
    items.push({
      canonicalKey: 'hvac.radiator',
      description: 'Радіатор сталевий панельний Purmo 22 600×1000',
      quantity: radiators,
      unit: 'шт',
      itemType: 'material',
      inputs: { radiators },
    });
    items.push({
      canonicalKey: 'hvac.radiator_thermostat',
      description: 'Термоголівка на радіатор',
      quantity: radiators,
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.radiator_install_labor',
      description: 'Робота: монтаж радіатора з підключенням',
      quantity: radiators,
      unit: 'шт',
      itemType: 'labor',
    });
  }

  // 3. Тепла підлога
  if (underfloorArea > 0) {
    items.push({
      canonicalKey: 'hvac.underfloor_pipe',
      description: 'Труба для теплої підлоги PEX-AL-PEX 16мм',
      quantity: round(underfloorArea * 6 * 1.10),
      unit: 'м',
      itemType: 'material',
      formula: 'underfloorArea × 6 м/м² × 1.10',
      inputs: { underfloorArea },
    });
    items.push({
      canonicalKey: 'hvac.underfloor_manifold',
      description: 'Колектор для теплої підлоги (з насосом)',
      quantity: 1,
      unit: 'компл',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.underfloor_thermostat',
      description: 'Терморегулятор кімнатний для теплої підлоги',
      quantity: Math.max(1, Math.ceil(underfloorArea / 20)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.underfloor_install_labor',
      description: 'Робота: монтаж теплої підлоги',
      quantity: underfloorArea,
      unit: 'м²',
      itemType: 'labor',
    });
  }

  // 4. Підведення газу
  if (needsGasConnection && gasConnectionDistance > 0) {
    items.push({
      canonicalKey: 'hvac.gas_pipe',
      description: 'Газова труба сталева DN20',
      quantity: round(gasConnectionDistance * 1.10),
      unit: 'м',
      itemType: 'material',
      formula: 'gasConnectionDistance × 1.10',
    });
    items.push({
      canonicalKey: 'hvac.gas_meter',
      description: 'Лічильник газу + ізоляційне з\'єднання + крани',
      quantity: 1,
      unit: 'компл',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.gas_install_labor',
      description: 'Робота: прокладання газопроводу + підключення',
      quantity: round(gasConnectionDistance),
      unit: 'м',
      itemType: 'labor',
    });
  }

  // 5. Вентиляція з рекуперацією
  if (ventRecuperation && area > 0) {
    items.push({
      canonicalKey: 'hvac.recuperator',
      description: 'Припливно-витяжна установка з рекуперацією',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
      inputs: { area },
    });
    items.push({
      canonicalKey: 'hvac.air_ducts',
      description: 'Повітроводи (магістраль + фасонні елементи)',
      quantity: round(area * 0.5),
      unit: 'м',
      itemType: 'material',
      formula: 'area × 0.5 м/м²',
    });
    items.push({
      canonicalKey: 'hvac.recuperator_install_labor',
      description: 'Робота: монтаж припливно-витяжної установки',
      quantity: 1,
      unit: 'компл',
      itemType: 'labor',
    });
  } else if (ventForced && area > 0) {
    items.push({
      canonicalKey: 'hvac.exhaust_fan',
      description: 'Вентилятор витяжний канальний',
      quantity: Math.max(1, Math.ceil(area / 80)),
      unit: 'шт',
      itemType: 'material',
    });
    items.push({
      canonicalKey: 'hvac.exhaust_ducts',
      description: 'Канал вентиляційний пластиковий 100мм',
      quantity: round(area * 0.3),
      unit: 'м',
      itemType: 'material',
    });
  }

  return items;
}
