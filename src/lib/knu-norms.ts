/**
 * Кошторисні норми України (КНУ РЕКНб) — 21 Збірник, 6687 норм.
 *
 * Source: e-construction.gov.ua, наказ Міністерства розвитку громад та територій
 * України 31.12.2021 № 374.
 *
 * Base rates used to compute labor prices:
 *   - Worker (робітник-будівельник): 250 ₴/люд.-год
 *   - Machinist (машиніст): 280 ₴/люд.-год
 *   - Overhead (накладні): 25%
 *
 * Formula: laborPrice = (workerHours × 250 + machinistHours × 280) × 1.25
 *
 * Норми автоматично витягнуті з офіційних PDF і прив'язані до агентів Metrum:
 *   - EarthworksAgent   → volume 1
 *   - FoundationAgent   → volumes 6, 7
 *   - WallsAgent        → volumes 8, 9
 *   - RoofingAgent      → volumes 10, 12
 *   - FinishingAgent    → volumes 11, 13, 15, 26
 *   - PlumbingAgent     → volumes 16, 17
 *   - HvacAgent         → volumes 18, 19, 20
 *   - ElectricalAgent   → volume 21
 *   - DemolitionAgent   → volume 46
 *   - (external nets)   → volumes 22, 23, 24
 */

import compactData from './knu-norms-data.json';

export type KnuVolume = number;

export type KnuSection =
  | 'earthworks'
  | 'concrete_cast'
  | 'concrete_precast'
  | 'masonry'
  | 'metal'
  | 'wood'
  | 'floors'
  | 'roofing'
  | 'corrosion'
  | 'finishing'
  | 'pipes_internal'
  | 'water_sewage_internal'
  | 'heating'
  | 'gas_internal'
  | 'ventilation'
  | 'electrical_lighting'
  | 'water_external'
  | 'sewage_external'
  | 'heating_external'
  | 'thermal_insulation'
  | 'reconstruction';

/**
 * Internal compact format (as stored in JSON):
 *   c = code, v = volume, s = section, g = group, t = groupTitle,
 *   d = description, u = unit, h = workerHours/unit, m = machinistHours/unit,
 *   p = laborPrice/unit
 */
interface CompactNorm {
  c: string;
  v: number;
  s: KnuSection;
  g: number;
  t: string;
  d: string;
  u: string;
  h: number;
  m: number;
  p: number;
}

/**
 * Public norm type.
 */
export interface KnuNorm {
  /** Код норми (напр., "15-60-1" або "1-10-1") */
  code: string;
  /** Номер збірника (1, 6, 7, 8, ..., 46) */
  volume: KnuVolume;
  /** Секція/ключ агента */
  section: KnuSection;
  /** Номер групи всередині збірника */
  group: number;
  /** Назва групи робіт */
  groupTitle: string;
  /** Повний опис роботи (з варіантом) */
  desc: string;
  /** Базова одиниця (м², м³, м.п., шт, т, км) */
  unit: string;
  /** Людино-години на одиницю (робітник) */
  workerHoursPerUnit: number;
  /** Людино-години на одиницю (машиніст) */
  machinistHoursPerUnit: number;
  /** Ціна праці за одиницю, грн (з накладними 25%) */
  laborPrice: number;
}

const rawNorms = compactData as CompactNorm[];

/**
 * Expanded norms with full field names — built once on module load.
 */
export const KNU_NORMS: KnuNorm[] = rawNorms.map((n) => ({
  code: n.c,
  volume: n.v,
  section: n.s,
  group: n.g,
  groupTitle: n.t,
  desc: n.d,
  unit: n.u,
  workerHoursPerUnit: n.h,
  machinistHoursPerUnit: n.m,
  laborPrice: n.p,
}));

/** Fast lookup by code. */
const codeIndex = new Map<string, KnuNorm>();
for (const n of KNU_NORMS) {
  codeIndex.set(n.code, n);
}

/** Norms grouped by section for fast filtering. */
const sectionIndex = new Map<KnuSection, KnuNorm[]>();
for (const n of KNU_NORMS) {
  if (!sectionIndex.has(n.section)) sectionIndex.set(n.section, []);
  sectionIndex.get(n.section)!.push(n);
}

/** Norms grouped by volume. */
const volumeIndex = new Map<KnuVolume, KnuNorm[]>();
for (const n of KNU_NORMS) {
  if (!volumeIndex.has(n.volume)) volumeIndex.set(n.volume, []);
  volumeIndex.get(n.volume)!.push(n);
}

export function getNormByCode(code: string): KnuNorm | null {
  return codeIndex.get(code) ?? null;
}

export function getNormsBySection(section: KnuSection): KnuNorm[] {
  return sectionIndex.get(section) ?? [];
}

export function getNormsByVolume(volume: KnuVolume): KnuNorm[] {
  return volumeIndex.get(volume) ?? [];
}

export function getNormsByVolumes(volumes: KnuVolume[]): KnuNorm[] {
  const result: KnuNorm[] = [];
  for (const v of volumes) {
    const list = volumeIndex.get(v);
    if (list) result.push(...list);
  }
  return result;
}

export const KNU_META = {
  source: 'Кошторисні норми України РЕКНб, e-construction.gov.ua',
  totalNorms: KNU_NORMS.length,
  totalVolumes: volumeIndex.size,
  workerRatePerHour: 250,
  machinistRatePerHour: 280,
  overheadPercent: 25,
  approvalDate: '2021-12-31',
  approvalDoc: 'Наказ Мінрегіону України №374',
  volumes: {
    1: 'Земляні роботи',
    6: 'Бетонні та залізобетонні конструкції монолітні',
    7: 'Бетонні та залізобетонні конструкції збірні',
    8: 'Конструкції з цегли та блоків',
    9: 'Металеві конструкції',
    10: 'Дерев\'яні конструкції',
    11: 'Підлоги',
    12: 'Покрівлі',
    13: 'Захист від корозії',
    15: 'Оздоблювальні роботи',
    16: 'Трубопроводи внутрішні',
    17: 'Водопровід і каналізація внутрішні',
    18: 'Опалення',
    19: 'Газопостачання внутрішнє',
    20: 'Вентиляція та кондиціювання',
    21: 'Електроосвітлення будинків',
    22: 'Водопровід зовнішній',
    23: 'Каналізація зовнішня',
    24: 'Теплопостачання та газопроводи зовнішні',
    26: 'Теплоізоляційні роботи',
    46: 'Роботи при реконструкції',
  } as Record<number, string>,
} as const;

/**
 * Map agent category → relevant volume numbers.
 * Used by agents to narrow their search space.
 */
export const AGENT_VOLUMES: Record<string, KnuVolume[]> = {
  earthworks: [1],
  foundation: [6, 7],
  walls: [8, 9],
  roofing: [10, 12],
  finishing: [11, 13, 15, 26],
  plumbing: [16, 17],
  hvac: [18, 19, 20],
  electrical: [21],
  demolition: [46],
  external_water: [22],
  external_sewage: [23],
  external_heating: [24],
};
