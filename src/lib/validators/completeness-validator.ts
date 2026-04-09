/**
 * Completeness validator: checks that "if X then Y" implications hold.
 *
 * Examples from the master plan:
 *   • if tileArea > 0 → must have tile + glue + grout + tiling labor;
 *   • if outlets > 0 → must have cable + junction box + breakers + install labor;
 *   • if groundwaterLevelM < 2 → must have drainage + waterproofing;
 *   • if heating type ≠ none → must have a heating section / radiators;
 *   • if demolitionRequired = false → no demolition items.
 */

import type { Validator, ValidatorItem } from './types';

function flatten(estimate: any): ValidatorItem[] {
  return (estimate.sections ?? []).flatMap((s: any) => s.items ?? []);
}

function hasAny(items: ValidatorItem[], tokens: string[]): boolean {
  return items.some((item) => {
    const desc = (item.description || '').toLowerCase();
    return tokens.some((t) => desc.includes(t));
  });
}

const FORBIDDEN_DEMOLITION_TOKENS = [
  'демонтаж',
  'зняття',
  'розбирання',
  'видалення',
  'демонтувати',
  'зняти',
  'розібрати',
];

export const completenessValidator: Validator = ({ estimate, facts, wizardData }) => {
  const issues: ReturnType<Validator> = [];
  const items = flatten(estimate);

  // Tile finishing implication.
  const tileArea = facts?.finishing?.tileAreaM2?.value
    ?? Number(wizardData?.finishing?.walls?.tileArea ?? 0)
    ?? 0;
  if (tileArea > 0) {
    const checks = [
      { tokens: ['плитк', 'tile'], code: 'MISSING_TILE', label: 'плитки' },
      { tokens: ['клей плитков', 'tile glue'], code: 'MISSING_TILE_GLUE', label: 'клею для плитки' },
      { tokens: ['затирк', 'grout'], code: 'MISSING_TILE_GROUT', label: 'затирки' },
      { tokens: ['укладанн', 'монтаж плитк'], code: 'MISSING_TILE_LABOR', label: 'роботи з укладання плитки' },
    ];
    for (const c of checks) {
      if (!hasAny(items, c.tokens)) {
        issues.push({
          severity: 'warning',
          code: c.code,
          message: `Площа плитки ${tileArea} м², але немає ${c.label} у кошторисі`,
        });
      }
    }
  }

  // Electrical outlets implication.
  const outlets = facts?.electrical?.outlets?.value ?? 0;
  if (outlets > 0) {
    const checks = [
      { tokens: ['кабел', 'cable'], code: 'MISSING_CABLE', label: 'кабелю' },
      { tokens: ['підрозетник'], code: 'MISSING_JUNCTION_BOX', label: 'підрозетників' },
      { tokens: ['автомат', 'breaker'], code: 'MISSING_BREAKER', label: 'автоматичних вимикачів' },
    ];
    for (const c of checks) {
      if (!hasAny(items, c.tokens)) {
        issues.push({
          severity: 'warning',
          code: c.code,
          message: `${outlets} розеток у проекті, але немає ${c.label}`,
        });
      }
    }
  }

  // Drainage required when groundwater is shallow.
  const ugv = facts?.geology?.groundwaterLevelM?.value;
  if (ugv !== undefined && ugv < 2) {
    if (!hasAny(items, ['дренаж', 'drainage'])) {
      issues.push({
        severity: 'error',
        code: 'MISSING_DRAINAGE',
        message: `УГВ ${ugv} м (< 2 м) — необхідна дренажна система, але її немає у кошторисі`,
      });
    }
    if (!hasAny(items, ['гідроізол', 'waterproof'])) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_WATERPROOFING',
        message: `УГВ ${ugv} м — необхідна гідроізоляція фундаменту`,
      });
    }
  }

  // Heating implication.
  const heatingType = facts?.heating?.type?.value ?? wizardData?.utilities?.heating?.type;
  if (heatingType && heatingType !== 'none') {
    if (!hasAny(items, ['опален', 'heating', 'котел', 'радіатор', 'тепла підлог'])) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_HEATING',
        message: `Тип опалення "${heatingType}", але у кошторисі немає опалювальних позицій`,
      });
    }
  }

  // Forbidden: demolition items when user said no demolition.
  const demolitionRequired = facts?.demolitionRequired?.value;
  if (demolitionRequired === false) {
    estimate.sections.forEach((section: any) => {
      section.items?.forEach((item: any, idx: number) => {
        const desc = (item.description || '').toLowerCase();
        if (FORBIDDEN_DEMOLITION_TOKENS.some((t) => desc.includes(t))) {
          issues.push({
            severity: 'error',
            code: 'FORBIDDEN_DEMOLITION_ITEM',
            message: `"${item.description}": користувач вказав що демонтаж НЕ потрібен`,
            section: section.title,
            itemIndex: idx,
          });
        }
      });
    });
  }

  return issues;
};
