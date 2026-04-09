/**
 * Builds a normalized `ProjectFacts` snapshot from raw project signals.
 *
 * Sources, in priority order:
 *   wizard > spec > drawing > rag > inferred
 *
 * The builder is intentionally conservative — it only emits a field when at
 * least one source provides a usable value. Fields that disagree across
 * sources end up in `conflicts[]` so the UI / review queue can flag them.
 */

import type { WizardData } from '@/lib/wizard-types';
import type { ExtractedProjectData } from '@/lib/rag/vectorizer';
import {
  ProjectFacts,
  ProjectFactsConflict,
  ProjectObjectType,
  SourcedValue,
  FactSource,
  SOURCE_PRIORITY,
  SOURCE_CONFIDENCE,
} from './types';

type Candidate<T> = { value: T; source: FactSource };

/**
 * Pick the highest-priority candidate. Records a conflict whenever two
 * candidates with different source-priorities both supply a value (or the
 * same priority but different values).
 */
function pickWithConflict<T>(
  field: string,
  candidates: Array<Candidate<T> | undefined>,
  conflicts: ProjectFactsConflict[],
  equals: (a: T, b: T) => boolean = (a, b) => a === b
): SourcedValue<T> | undefined {
  const present = candidates.filter((c): c is Candidate<T> => !!c && c.value !== undefined && c.value !== null);
  if (present.length === 0) return undefined;

  // Sort highest priority first.
  const sorted = [...present].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
  );
  const winner = sorted[0];

  const disagreements = sorted.filter((c) => !equals(c.value, winner.value));
  if (disagreements.length > 0) {
    conflicts.push({
      field,
      sources: sorted.map((c) => ({ source: c.source, value: c.value })),
      chosen: winner.source,
    });
  }

  return {
    value: winner.value,
    source: winner.source,
    confidence: SOURCE_CONFIDENCE[winner.source],
  };
}

function approxEquals(a: number, b: number, tolerance = 0.01): boolean {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= tolerance;
}

function parseNumeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function mapObjectType(t: WizardData['objectType'] | undefined): ProjectObjectType {
  if (!t) return 'other';
  switch (t) {
    case 'house':
    case 'townhouse':
    case 'apartment':
    case 'office':
    case 'commercial':
      return t;
    default:
      return 'other';
  }
}

export interface BuildProjectFactsInput {
  wizardData: WizardData;
  extracted?: ExtractedProjectData | null;
}

export function buildProjectFacts(input: BuildProjectFactsInput): ProjectFacts {
  const { wizardData, extracted } = input;
  const conflicts: ProjectFactsConflict[] = [];

  // --- objectType ---
  const objectType = pickWithConflict<ProjectObjectType>(
    'objectType',
    [
      { value: mapObjectType(wizardData.objectType), source: 'wizard' },
    ],
    conflicts
  ) as SourcedValue<ProjectObjectType>;

  // --- area ---
  const wizardArea = parseNumeric(wizardData.totalArea);
  const ragArea = parseNumeric(extracted?.totalArea);
  const area = pickWithConflict<number>(
    'area',
    [
      wizardArea !== undefined ? { value: wizardArea, source: 'wizard' as FactSource } : undefined,
      ragArea !== undefined ? { value: ragArea, source: 'rag' as FactSource } : undefined,
    ],
    conflicts,
    approxEquals
  ) ?? {
    // Synthetic fallback so downstream rules can rely on a number.
    value: 0,
    source: 'inferred',
    confidence: SOURCE_CONFIDENCE.inferred,
  };

  // --- floors ---
  const wizardFloors = typeof wizardData.floors === 'number' && wizardData.floors > 0
    ? wizardData.floors
    : undefined;
  const ragFloors = parseNumeric(extracted?.floors);
  const floors = pickWithConflict<number>(
    'floors',
    [
      wizardFloors !== undefined ? { value: wizardFloors, source: 'wizard' as FactSource } : undefined,
      ragFloors !== undefined ? { value: ragFloors, source: 'rag' as FactSource } : undefined,
    ],
    conflicts
  );

  // --- ceilingHeight ---
  const ceilingHeightNum = parseNumeric(wizardData.ceilingHeight);
  const ragCeilingHeight = parseNumeric(extracted?.floorHeight);
  const ceilingHeight = pickWithConflict<number>(
    'ceilingHeight',
    [
      ceilingHeightNum !== undefined ? { value: ceilingHeightNum, source: 'wizard' as FactSource } : undefined,
      ragCeilingHeight !== undefined ? { value: ragCeilingHeight, source: 'rag' as FactSource } : undefined,
    ],
    conflicts
  );

  // --- walls ---
  const wallsMaterial = wizardData.houseData?.walls?.material
    ?? wizardData.townhouseData?.houseData?.walls?.material;
  const ragWallMaterial = extracted?.wallMaterial;
  const wallMaterialValue = pickWithConflict<string>(
    'walls.material',
    [
      wallsMaterial ? { value: wallsMaterial, source: 'wizard' as FactSource } : undefined,
      ragWallMaterial ? { value: ragWallMaterial, source: 'rag' as FactSource } : undefined,
    ],
    conflicts
  );

  const wallsThicknessRaw = wizardData.houseData?.walls?.thickness
    ?? wizardData.townhouseData?.houseData?.walls?.thickness;
  const wallsThickness = parseNumeric(wallsThicknessRaw);
  const wallThicknessValue = wallsThickness !== undefined
    ? pickWithConflict<number>(
        'walls.thicknessMm',
        [{ value: wallsThickness, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;

  // --- electrical ---
  const el = wizardData.utilities?.electrical;
  const electrical = el
    ? {
        outlets: el.outlets > 0
          ? pickWithConflict<number>('electrical.outlets', [{ value: el.outlets, source: 'wizard' }], conflicts)
          : undefined,
        switches: el.switches > 0
          ? pickWithConflict<number>('electrical.switches', [{ value: el.switches, source: 'wizard' }], conflicts)
          : undefined,
        lightPoints: el.lightPoints > 0
          ? pickWithConflict<number>('electrical.lightPoints', [{ value: el.lightPoints, source: 'wizard' }], conflicts)
          : undefined,
      }
    : undefined;

  // --- plumbing (water + sewerage points are not directly modeled in wizard,
  //     but coldWater/hotWater + sewerage type give us at least booleans we
  //     can convert into "has at least 1 point" inferred values).
  const water = wizardData.utilities?.water;
  const sewerage = wizardData.utilities?.sewerage;
  const plumbing = (water || sewerage)
    ? {
        waterPoints: water?.coldWater
          ? pickWithConflict<number>('plumbing.waterPoints', [{ value: 1, source: 'inferred' }], conflicts)
          : undefined,
        sewerPoints: sewerage
          ? pickWithConflict<number>('plumbing.sewerPoints', [{ value: 1, source: 'inferred' }], conflicts)
          : undefined,
      }
    : undefined;

  // --- heating ---
  const ht = wizardData.utilities?.heating;
  const heating = ht
    ? {
        type: ht.type
          ? pickWithConflict<string>('heating.type', [{ value: ht.type, source: 'wizard' }], conflicts)
          : undefined,
        radiators: ht.radiators && ht.radiators > 0
          ? pickWithConflict<number>('heating.radiators', [{ value: ht.radiators, source: 'wizard' }], conflicts)
          : undefined,
        underfloorAreaM2: parseNumeric(ht.underfloorArea) !== undefined
          ? pickWithConflict<number>('heating.underfloorAreaM2', [{ value: parseNumeric(ht.underfloorArea)!, source: 'wizard' }], conflicts)
          : undefined,
      }
    : undefined;

  // --- geology ---
  const ragGeo = extracted?.geology;
  const wizardSoil = wizardData.houseData?.terrain?.soilType;
  const wizardGroundwaterDepth = wizardData.houseData?.terrain?.groundwaterDepth;
  // Map wizard's coarse enum to a numeric estimate so the quantity engine
  // (Phase 3) gets a single comparable value. These are conservative
  // midpoints, marked as `inferred`.
  const wizardGroundwaterM = wizardGroundwaterDepth === 'shallow' ? 1
    : wizardGroundwaterDepth === 'medium' ? 3
    : wizardGroundwaterDepth === 'deep' ? 6
    : undefined;
  const geology = (ragGeo?.ugv !== undefined || ragGeo?.soilType !== undefined || wizardSoil !== undefined || wizardGroundwaterM !== undefined)
    ? {
        groundwaterLevelM: pickWithConflict<number>(
          'geology.groundwaterLevelM',
          [
            ragGeo?.ugv !== undefined ? { value: ragGeo.ugv, source: 'rag' as FactSource } : undefined,
            wizardGroundwaterM !== undefined ? { value: wizardGroundwaterM, source: 'inferred' as FactSource } : undefined,
          ],
          conflicts
        ),
        soilType: pickWithConflict<string>(
          'geology.soilType',
          [
            ragGeo?.soilType ? { value: ragGeo.soilType, source: 'rag' as FactSource } : undefined,
            wizardSoil ? { value: wizardSoil, source: 'wizard' as FactSource } : undefined,
          ],
          conflicts
        ),
      }
    : undefined;

  // --- finishing ---
  const tileArea = parseNumeric(wizardData.finishing?.walls?.tileArea)
    ?? parseNumeric(wizardData.finishing?.flooring?.tile);
  const laminate = parseNumeric(wizardData.finishing?.flooring?.laminate);
  const finishing = (tileArea !== undefined || laminate !== undefined)
    ? {
        tileAreaM2: tileArea !== undefined
          ? pickWithConflict<number>('finishing.tileAreaM2', [{ value: tileArea, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        laminateAreaM2: laminate !== undefined
          ? pickWithConflict<number>('finishing.laminateAreaM2', [{ value: laminate, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- demolitionRequired ---
  const wizardDemo =
    wizardData.houseData?.demolitionRequired
    ?? wizardData.townhouseData?.demolitionRequired
    ?? wizardData.commercialData?.demolitionRequired
    ?? wizardData.renovationData?.workRequired?.demolition;
  const ragDemo = extracted?.siteCondition?.needsDemolition;
  const demolitionRequired = pickWithConflict<boolean>(
    'demolitionRequired',
    [
      wizardDemo !== undefined ? { value: !!wizardDemo, source: 'wizard' as FactSource } : undefined,
      ragDemo !== undefined ? { value: !!ragDemo, source: 'rag' as FactSource } : undefined,
    ],
    conflicts
  );

  return {
    objectType,
    area,
    floors,
    ceilingHeight,
    walls: (wallMaterialValue || wallThicknessValue) ? {
      material: wallMaterialValue,
      thicknessMm: wallThicknessValue,
    } : undefined,
    electrical,
    plumbing,
    heating,
    geology,
    finishing,
    demolitionRequired,
    conflicts,
  };
}
