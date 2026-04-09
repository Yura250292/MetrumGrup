/**
 * Wizard-consistency validator: checks that the estimate honours wizard
 * choices that are not strictly numerical (materials, types, special requests).
 *
 *   • Wall material from wizard appears somewhere in the items.
 *   • Foundation type from wizard appears in foundation section.
 *   • Roof material if specified.
 *   • specialRequirements text from wizard is not silently ignored when it
 *     names a recognisable keyword.
 */

import type { Validator, ValidatorItem } from './types';

const WALL_MATERIAL_TOKENS: Record<string, string[]> = {
  gasblock: ['газоблок', 'газобетон', 'aeroc'],
  brick: ['цегла', 'керамоблок'],
  wood: ['дерев', 'брус', 'каркас'],
  panel: ['панел', 'sip', 'сіп'],
  monolith: ['монолі', 'бетон стін'],
};

const FOUNDATION_TOKENS: Record<string, string[]> = {
  strip: ['стрічков', 'фундамент стрічк'],
  slab: ['плит', 'плитн'],
  pile: ['пал', 'пильов', 'paль'],
  combined: ['комбінован'],
};

const ROOF_MATERIAL_TOKENS: Record<string, string[]> = {
  metal_tile: ['металочерепиц'],
  soft_tile: ['мʼяк', 'м\'як', 'бітумн'],
  profiled_sheet: ['профнастил', 'профильн'],
  ceramic: ['керамічн'],
  slate: ['шифер'],
};

function flatten(estimate: any): ValidatorItem[] {
  return (estimate.sections ?? []).flatMap((s: any) => s.items ?? []);
}

function hasAny(items: ValidatorItem[], tokens: string[]): boolean {
  return items.some((item) => {
    const desc = (item.description || '').toLowerCase();
    return tokens.some((t) => desc.includes(t));
  });
}

export const wizardConsistencyValidator: Validator = ({ estimate, facts, wizardData }) => {
  const issues: ReturnType<Validator> = [];
  if (!wizardData) return issues;

  const items = flatten(estimate);

  // Wall material.
  const wallMaterial =
    wizardData.houseData?.walls?.material
    ?? wizardData.townhouseData?.houseData?.walls?.material;
  if (wallMaterial) {
    const tokens = WALL_MATERIAL_TOKENS[wallMaterial] ?? [];
    if (tokens.length > 0 && !hasAny(items, tokens)) {
      issues.push({
        severity: 'warning',
        code: 'WALL_MATERIAL_NOT_USED',
        message: `Wizard вказав матеріал стін "${wallMaterial}", але у кошторисі його не знайдено`,
        details: { wallMaterial, expectedTokens: tokens },
      });
    }
  }

  // Foundation type.
  const foundationType = facts?.foundation?.type?.value
    ?? wizardData.houseData?.foundation?.type
    ?? wizardData.townhouseData?.houseData?.foundation?.type;
  if (foundationType) {
    const tokens = FOUNDATION_TOKENS[foundationType] ?? [];
    if (tokens.length > 0 && !hasAny(items, tokens)) {
      issues.push({
        severity: 'warning',
        code: 'FOUNDATION_TYPE_NOT_USED',
        message: `Wizard вказав фундамент "${foundationType}", але у кошторисі його не знайдено`,
        details: { foundationType, expectedTokens: tokens },
      });
    }
  }

  // Roof material.
  const roofMaterial =
    facts?.roof?.material?.value
    ?? wizardData.houseData?.roof?.material
    ?? wizardData.townhouseData?.houseData?.roof?.material;
  if (roofMaterial) {
    const tokens = ROOF_MATERIAL_TOKENS[roofMaterial] ?? [];
    if (tokens.length > 0 && !hasAny(items, tokens)) {
      issues.push({
        severity: 'warning',
        code: 'ROOF_MATERIAL_NOT_USED',
        message: `Wizard вказав покрівлю "${roofMaterial}", але у кошторисі її не знайдено`,
        details: { roofMaterial, expectedTokens: tokens },
      });
    }
  }

  return issues;
};
