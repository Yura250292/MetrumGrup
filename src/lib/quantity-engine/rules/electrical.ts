/**
 * Electrical quantity rules.
 *
 * Inputs: outlets, switches, lightPoints, area (for ambient lighting load).
 * Outputs: cable runs, junction boxes, breakers, panel.
 */

import type { EngineItem, EngineRuleContext } from '../types';
import { CABLE_LENGTH, LIGHTING_LOAD_W_PER_M2, WASTE } from '../factors';

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function electricalRules(ctx: EngineRuleContext): EngineItem[] {
  const items: EngineItem[] = [];
  const facts = ctx.facts;
  const outlets = facts.electrical?.outlets?.value ?? 0;
  const switches = facts.electrical?.switches?.value ?? 0;
  const lightPoints = facts.electrical?.lightPoints?.value ?? 0;
  const area = ctx.geometry.totalAreaM2;
  const power = facts.electrical?.power?.value;
  const capacityKw = facts.electrical?.capacityKw?.value ?? 0;
  const needsConnection = facts.electrical?.needsConnection?.value ?? false;
  const connectionDistanceM = facts.electrical?.connectionDistanceM?.value ?? 0;
  const needsTransformer = facts.electrical?.needsTransformer?.value ?? false;
  const outdoorLighting = facts.electrical?.outdoorLighting?.value ?? false;

  // 1. Підрозетники (outlets + switches + light point boxes)
  const boxes = outlets + switches + lightPoints;
  if (boxes > 0) {
    items.push({
      canonicalKey: 'electrical.junction_box',
      description: 'Підрозетник монтажний',
      quantity: boxes,
      unit: 'шт',
      itemType: 'material',
      formula: 'outlets + switches + lightPoints',
      inputs: { outlets, switches, lightPoints },
    });
  }

  // 2. Силовий кабель (по сумі ділянок до розеток / вимикачів / світильників)
  if (boxes > 0) {
    const rawCableM =
      outlets * CABLE_LENGTH.perOutlet +
      switches * CABLE_LENGTH.perSwitch +
      lightPoints * CABLE_LENGTH.perLightPoint;
    const cableM = round(rawCableM * WASTE.cable);
    items.push({
      canonicalKey: 'electrical.power_cable',
      description: 'Кабель силовий ВВГнг 3×2.5',
      quantity: cableM,
      unit: 'м',
      itemType: 'material',
      formula: '(outlets*8 + switches*6 + lightPoints*7) * 1.15',
      inputs: { outlets, switches, lightPoints },
      wasteFactor: WASTE.cable,
    });
  }

  // 3. Розетки фінішні (1 шт на 1 встановлене гніздо)
  if (outlets > 0) {
    items.push({
      canonicalKey: 'electrical.outlet_finish',
      description: 'Розетка з заземленням (фінішне встановлення)',
      quantity: outlets,
      unit: 'шт',
      itemType: 'material',
      inputs: { outlets },
    });
  }

  // 4. Вимикачі фінішні
  if (switches > 0) {
    items.push({
      canonicalKey: 'electrical.switch_finish',
      description: 'Вимикач (фінішне встановлення)',
      quantity: switches,
      unit: 'шт',
      itemType: 'material',
      inputs: { switches },
    });
  }

  // 5. Світильники (під light points)
  if (lightPoints > 0) {
    items.push({
      canonicalKey: 'electrical.light_fixture',
      description: 'Світильник LED (точка освітлення)',
      quantity: lightPoints,
      unit: 'шт',
      itemType: 'material',
      inputs: { lightPoints },
    });
  }

  // 6. Автомати: 1 на групу, групи ~ outlets/8 + lightPoints/10 + 2 базові
  const breakerGroups =
    Math.ceil(outlets / 8) +
    Math.ceil(lightPoints / 10) +
    2; // вступний + резерв
  if (breakerGroups > 0 && (outlets > 0 || lightPoints > 0)) {
    items.push({
      canonicalKey: 'electrical.breaker',
      description: 'Автоматичний вимикач 16A',
      quantity: breakerGroups,
      unit: 'шт',
      itemType: 'material',
      formula: 'ceil(outlets/8) + ceil(lightPoints/10) + 2',
      inputs: { outlets, lightPoints, breakerGroups },
    });
  }

  // 7. Електрощит (1 шт)
  if (boxes > 0) {
    items.push({
      canonicalKey: 'electrical.distribution_panel',
      description: 'Електрощит розподільчий (на DIN-рейці)',
      quantity: 1,
      unit: 'шт',
      itemType: 'material',
    });
  }

  // 8. Робота: монтаж електроточки (нормо-точка)
  if (boxes > 0) {
    items.push({
      canonicalKey: 'electrical.point_install_labor',
      description: 'Монтаж електроточки (штроба, кабель, підрозетник)',
      quantity: boxes,
      unit: 'точка',
      itemType: 'labor',
      inputs: { boxes },
    });
  }

  // 9. Орієнтовна загальна освітлювальна потужність — info-only підказка LLM
  if (area > 0 && lightPoints === 0) {
    items.push({
      canonicalKey: 'electrical.lighting_load_hint',
      description: `Розрахункове навантаження освітлення (~${LIGHTING_LOAD_W_PER_M2} Вт/м²)`,
      quantity: round(area * LIGHTING_LOAD_W_PER_M2),
      unit: 'Вт',
      itemType: 'composite',
      formula: 'area * 12',
      inputs: { area },
    });
  }

  // 10. Підведення електрики від мережі (для нових будівель)
  if (needsConnection && connectionDistanceM > 0) {
    const cableSize = power === 'three_phase' ? '4×16' : '3×16';
    items.push({
      canonicalKey: 'electrical.service_cable',
      description: `Підвідний кабель ${cableSize} мм² (від стовпа до щита)`,
      quantity: round(connectionDistanceM * 1.10),
      unit: 'м',
      itemType: 'material',
      formula: 'connectionDistance × 1.10 запас',
      inputs: { connectionDistanceM },
    });
    items.push({
      canonicalKey: 'electrical.service_install_labor',
      description: 'Робота: прокладання підвідного кабелю + підключення',
      quantity: round(connectionDistanceM),
      unit: 'м',
      itemType: 'labor',
    });
    items.push({
      canonicalKey: 'electrical.meter_box',
      description: 'Електролічильник + бокс зовнішній на стовпі',
      quantity: 1,
      unit: 'компл',
      itemType: 'material',
    });
  }

  // 11. Трансформаторна підстанція (для великих об'єктів — комерції/виробництва)
  if (needsTransformer) {
    items.push({
      canonicalKey: 'electrical.transformer',
      description: 'Трансформаторна підстанція 10/0.4 кВ',
      quantity: 1,
      unit: 'компл',
      itemType: 'equipment',
    });
  }

  // 12. Підвищена потужність / трифазне підключення (більше кабелю + щит)
  if (power === 'three_phase' && capacityKw > 0) {
    const cableM = round(area * 0.5);
    items.push({
      canonicalKey: 'electrical.three_phase_cable',
      description: `Кабель силовий 4×6 мм² (трифаза, ${capacityKw} кВт)`,
      quantity: cableM,
      unit: 'м',
      itemType: 'material',
      inputs: { area, capacityKw },
    });
  }

  // 13. Зовнішнє освітлення
  if (outdoorLighting && area > 0) {
    const fixturesCount = Math.max(4, Math.ceil(area / 50));
    items.push({
      canonicalKey: 'electrical.outdoor_fixture',
      description: 'Світильник вуличний LED 30W IP65',
      quantity: fixturesCount,
      unit: 'шт',
      itemType: 'material',
      formula: 'max(4, area/50)',
    });
    items.push({
      canonicalKey: 'electrical.outdoor_cable',
      description: 'Кабель зовнішній ВВГнгд 3×1.5 (зовнішнє освітлення)',
      quantity: round(fixturesCount * 15),
      unit: 'м',
      itemType: 'material',
    });
  }

  return items;
}
