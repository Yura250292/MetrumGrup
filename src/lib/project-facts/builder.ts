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
  const wizardWalls = wizardData.houseData?.walls
    ?? wizardData.townhouseData?.houseData?.walls;
  const ragWallMaterial = extracted?.wallMaterial;
  const wallMaterialValue = pickWithConflict<string>(
    'walls.material',
    [
      wizardWalls?.material ? { value: wizardWalls.material, source: 'wizard' as FactSource } : undefined,
      ragWallMaterial ? { value: ragWallMaterial, source: 'rag' as FactSource } : undefined,
    ],
    conflicts
  );
  const wallsThickness = parseNumeric(wizardWalls?.thickness);
  const wallThicknessValue = wallsThickness !== undefined
    ? pickWithConflict<number>(
        'walls.thicknessMm',
        [{ value: wallsThickness, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;
  const wallInsulation = wizardWalls?.insulation !== undefined
    ? pickWithConflict<boolean>('walls.insulation', [{ value: !!wizardWalls.insulation, source: 'wizard' as FactSource }], conflicts)
    : undefined;
  const wallInsulationType = wizardWalls?.insulationType
    ? pickWithConflict<'foam' | 'mineral' | 'ecowool'>(
        'walls.insulationType',
        [{ value: wizardWalls.insulationType, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;
  const wallInsulationThickness = wizardWalls?.insulationThickness !== undefined
    ? pickWithConflict<number>(
        'walls.insulationThicknessMm',
        [{ value: wizardWalls.insulationThickness, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;
  const wallLoadBearing = wizardWalls?.hasLoadBearing !== undefined
    ? pickWithConflict<boolean>(
        'walls.hasLoadBearing',
        [{ value: !!wizardWalls.hasLoadBearing, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;
  const wallPartition = wizardWalls?.partitionMaterial
    ? pickWithConflict<'gasblock' | 'brick' | 'gypsum' | 'same'>(
        'walls.partitionMaterial',
        [{ value: wizardWalls.partitionMaterial, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;

  // --- electrical ---
  const el = wizardData.utilities?.electrical;
  const electrical = el
    ? {
        power: el.power
          ? pickWithConflict<'single_phase' | 'three_phase'>('electrical.power', [{ value: el.power, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        capacityKw: el.capacity && el.capacity > 0
          ? pickWithConflict<number>('electrical.capacityKw', [{ value: el.capacity, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        outlets: el.outlets > 0
          ? pickWithConflict<number>('electrical.outlets', [{ value: el.outlets, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        switches: el.switches > 0
          ? pickWithConflict<number>('electrical.switches', [{ value: el.switches, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        lightPoints: el.lightPoints > 0
          ? pickWithConflict<number>('electrical.lightPoints', [{ value: el.lightPoints, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        outdoorLighting: el.outdoorLighting !== undefined
          ? pickWithConflict<boolean>('electrical.outdoorLighting', [{ value: !!el.outdoorLighting, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        needsConnection: el.needsConnection !== undefined
          ? pickWithConflict<boolean>('electrical.needsConnection', [{ value: !!el.needsConnection, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        connectionDistanceM: el.connectionDistance && el.connectionDistance > 0
          ? pickWithConflict<number>('electrical.connectionDistanceM', [{ value: el.connectionDistance, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        needsTransformer: el.needsTransformer !== undefined
          ? pickWithConflict<boolean>('electrical.needsTransformer', [{ value: !!el.needsTransformer, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- plumbing ---
  const water = wizardData.utilities?.water;
  const sewerage = wizardData.utilities?.sewerage;
  const plumbing = (water || sewerage)
    ? {
        coldWater: water?.coldWater !== undefined
          ? pickWithConflict<boolean>('plumbing.coldWater', [{ value: !!water.coldWater, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        hotWater: water?.hotWater !== undefined
          ? pickWithConflict<boolean>('plumbing.hotWater', [{ value: !!water.hotWater, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        source: water?.source
          ? pickWithConflict<'central' | 'well' | 'borehole'>('plumbing.source', [{ value: water.source, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        boilerType: water?.boilerType
          ? pickWithConflict<'gas' | 'electric' | 'none'>('plumbing.boilerType', [{ value: water.boilerType, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        boilerVolumeL: water?.boilerVolume && water.boilerVolume > 0
          ? pickWithConflict<number>('plumbing.boilerVolumeL', [{ value: water.boilerVolume, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        needsConnection: water?.needsConnection !== undefined
          ? pickWithConflict<boolean>('plumbing.needsConnection', [{ value: !!water.needsConnection, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        connectionDistanceM: water?.connectionDistance && water.connectionDistance > 0
          ? pickWithConflict<number>('plumbing.connectionDistanceM', [{ value: water.connectionDistance, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        needsPump: water?.needsPump !== undefined
          ? pickWithConflict<boolean>('plumbing.needsPump', [{ value: !!water.needsPump, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        waterPoints: water?.coldWater
          ? pickWithConflict<number>('plumbing.waterPoints', [{ value: 1, source: 'inferred' as FactSource }], conflicts)
          : undefined,
        sewerPoints: sewerage
          ? pickWithConflict<number>('plumbing.sewerPoints', [{ value: 1, source: 'inferred' as FactSource }], conflicts)
          : undefined,
        sewerageType: sewerage?.type
          ? pickWithConflict<'central' | 'septic' | 'treatment'>('plumbing.sewerageType', [{ value: sewerage.type, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        sewerPumpNeeded: sewerage?.pumpNeeded !== undefined
          ? pickWithConflict<boolean>('plumbing.sewerPumpNeeded', [{ value: !!sewerage.pumpNeeded, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        sewerNeedsLift: sewerage?.needsLift !== undefined
          ? pickWithConflict<boolean>('plumbing.sewerNeedsLift', [{ value: !!sewerage.needsLift, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- heating ---
  const ht = wizardData.utilities?.heating;
  const heating = ht
    ? {
        type: ht.type
          ? pickWithConflict<string>('heating.type', [{ value: ht.type, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        radiators: ht.radiators && ht.radiators > 0
          ? pickWithConflict<number>('heating.radiators', [{ value: ht.radiators, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        underfloorAreaM2: parseNumeric(ht.underfloorArea) !== undefined
          ? pickWithConflict<number>('heating.underfloorAreaM2', [{ value: parseNumeric(ht.underfloorArea)!, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        boilerPowerKw: ht.boilerPower && ht.boilerPower > 0
          ? pickWithConflict<number>('heating.boilerPowerKw', [{ value: ht.boilerPower, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        needsGasConnection: ht.needsGasConnection !== undefined
          ? pickWithConflict<boolean>('heating.needsGasConnection', [{ value: !!ht.needsGasConnection, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        gasConnectionDistanceM: ht.gasConnectionDistance && ht.gasConnectionDistance > 0
          ? pickWithConflict<number>('heating.gasConnectionDistanceM', [{ value: ht.gasConnectionDistance, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- ventilation ---
  const vent = wizardData.utilities?.ventilation;
  const ventilation = vent
    ? {
        natural: vent.natural !== undefined
          ? pickWithConflict<boolean>('ventilation.natural', [{ value: !!vent.natural, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        forced: vent.forced !== undefined
          ? pickWithConflict<boolean>('ventilation.forced', [{ value: !!vent.forced, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        recuperation: vent.recuperation !== undefined
          ? pickWithConflict<boolean>('ventilation.recuperation', [{ value: !!vent.recuperation, source: 'wizard' as FactSource }], conflicts)
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
  const fin = wizardData.finishing;
  const tileWallArea = parseNumeric(fin?.walls?.tileArea);
  const tileFloorArea = parseNumeric(fin?.flooring?.tile);
  const tileArea = tileWallArea !== undefined && tileFloorArea !== undefined
    ? tileWallArea + tileFloorArea
    : (tileWallArea ?? tileFloorArea);
  const laminate = parseNumeric(fin?.flooring?.laminate);
  const parquet = parseNumeric(fin?.flooring?.parquet);
  const vinyl = parseNumeric(fin?.flooring?.vinyl);
  const carpet = parseNumeric(fin?.flooring?.carpet);
  const epoxy = parseNumeric(fin?.flooring?.epoxy);
  const finishing = (tileArea !== undefined || laminate !== undefined || parquet !== undefined ||
                     vinyl !== undefined || carpet !== undefined || epoxy !== undefined ||
                     fin?.walls?.material || fin?.ceiling?.type)
    ? {
        wallMaterial: fin?.walls?.material
          ? pickWithConflict<string>('finishing.wallMaterial', [{ value: fin.walls.material, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        qualityLevel: fin?.walls?.qualityLevel
          ? pickWithConflict<'economy' | 'standard' | 'premium'>(
              'finishing.qualityLevel',
              [{ value: fin.walls.qualityLevel, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        tileAreaM2: tileArea !== undefined
          ? pickWithConflict<number>('finishing.tileAreaM2', [{ value: tileArea, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        laminateAreaM2: laminate !== undefined
          ? pickWithConflict<number>('finishing.laminateAreaM2', [{ value: laminate, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        parquetAreaM2: parquet !== undefined
          ? pickWithConflict<number>('finishing.parquetAreaM2', [{ value: parquet, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        vinylAreaM2: vinyl !== undefined
          ? pickWithConflict<number>('finishing.vinylAreaM2', [{ value: vinyl, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        carpetAreaM2: carpet !== undefined
          ? pickWithConflict<number>('finishing.carpetAreaM2', [{ value: carpet, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        epoxyAreaM2: epoxy !== undefined
          ? pickWithConflict<number>('finishing.epoxyAreaM2', [{ value: epoxy, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        ceilingType: fin?.ceiling?.type
          ? pickWithConflict<'paint' | 'drywall' | 'suspended' | 'stretch'>(
              'finishing.ceilingType',
              [{ value: fin.ceiling.type, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        ceilingLevels: fin?.ceiling?.levels !== undefined
          ? pickWithConflict<number>('finishing.ceilingLevels', [{ value: fin.ceiling.levels, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- openings (windows + doors) ---
  const op = wizardData.openings;
  const openings = op
    ? {
        windowsCount: op.windows?.count && op.windows.count > 0
          ? pickWithConflict<number>('openings.windowsCount', [{ value: op.windows.count, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        windowsTotalAreaM2: op.windows?.totalArea && op.windows.totalArea > 0
          ? pickWithConflict<number>('openings.windowsTotalAreaM2', [{ value: op.windows.totalArea, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        windowsType: op.windows?.type
          ? pickWithConflict<'plastic' | 'wood' | 'aluminum'>('openings.windowsType', [{ value: op.windows.type, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        windowsGlazing: op.windows?.glazing
          ? pickWithConflict<'single' | 'double' | 'triple'>('openings.windowsGlazing', [{ value: op.windows.glazing, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        doorsEntrance: op.doors?.entrance && op.doors.entrance > 0
          ? pickWithConflict<number>('openings.doorsEntrance', [{ value: op.doors.entrance, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        doorsInterior: op.doors?.interior && op.doors.interior > 0
          ? pickWithConflict<number>('openings.doorsInterior', [{ value: op.doors.interior, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- extras (basement, attic, garage) — house only ---
  const hd = wizardData.houseData ?? wizardData.townhouseData?.houseData;
  const hasExtras = hd && (hd.hasBasement || hd.hasAttic || hd.hasGarage);
  const extras = hasExtras
    ? {
        hasBasement: hd!.hasBasement !== undefined
          ? pickWithConflict<boolean>('extras.hasBasement', [{ value: !!hd!.hasBasement, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        basementAreaM2: parseNumeric(hd!.basementArea) !== undefined
          ? pickWithConflict<number>('extras.basementAreaM2', [{ value: parseNumeric(hd!.basementArea)!, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        hasAttic: hd!.hasAttic !== undefined
          ? pickWithConflict<boolean>('extras.hasAttic', [{ value: !!hd!.hasAttic, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        atticAreaM2: parseNumeric(hd!.atticArea) !== undefined
          ? pickWithConflict<number>('extras.atticAreaM2', [{ value: parseNumeric(hd!.atticArea)!, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        hasGarage: hd!.hasGarage !== undefined
          ? pickWithConflict<boolean>('extras.hasGarage', [{ value: !!hd!.hasGarage, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        garageAreaM2: parseNumeric(hd!.garageArea) !== undefined
          ? pickWithConflict<number>('extras.garageAreaM2', [{ value: parseNumeric(hd!.garageArea)!, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        garageType: hd!.garageType
          ? pickWithConflict<'attached' | 'detached'>('extras.garageType', [{ value: hd!.garageType, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- renovation (apartment / office) ---
  const rd = wizardData.renovationData;
  const renovation = rd
    ? {
        currentStage: rd.currentStage
          ? pickWithConflict<'bare_concrete' | 'rough_walls' | 'rough_floor' | 'utilities_installed' | 'ready_for_finish'>(
              'renovation.currentStage',
              [{ value: rd.currentStage, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        layoutChange: rd.layoutChange !== undefined
          ? pickWithConflict<boolean>('renovation.layoutChange', [{ value: !!rd.layoutChange, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        newPartitions: rd.newPartitions !== undefined
          ? pickWithConflict<boolean>('renovation.newPartitions', [{ value: !!rd.newPartitions, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        newPartitionsLengthM: parseNumeric(rd.newPartitionsLength) !== undefined
          ? pickWithConflict<number>('renovation.newPartitionsLengthM', [{ value: parseNumeric(rd.newPartitionsLength)!, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        bedrooms: rd.rooms?.bedrooms !== undefined
          ? pickWithConflict<number>('renovation.bedrooms', [{ value: rd.rooms.bedrooms, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        bathrooms: rd.rooms?.bathrooms !== undefined
          ? pickWithConflict<number>('renovation.bathrooms', [{ value: rd.rooms.bathrooms, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        kitchen: rd.rooms?.kitchen !== undefined
          ? pickWithConflict<number>('renovation.kitchen', [{ value: rd.rooms.kitchen, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        living: rd.rooms?.living !== undefined
          ? pickWithConflict<number>('renovation.living', [{ value: rd.rooms.living, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        other: rd.rooms?.other !== undefined
          ? pickWithConflict<number>('renovation.other', [{ value: rd.rooms.other, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        workRequired: rd.workRequired
          ? pickWithConflict<Record<string, boolean>>(
              'renovation.workRequired',
              [{ value: rd.workRequired as unknown as Record<string, boolean>, source: 'wizard' as FactSource }],
              conflicts,
              () => true // skip equality check for objects
            )
          : undefined,
        existing: rd.existing
          ? pickWithConflict<Record<string, boolean>>(
              'renovation.existing',
              [{ value: rd.existing as unknown as Record<string, boolean>, source: 'wizard' as FactSource }],
              conflicts,
              () => true
            )
          : undefined,
      }
    : undefined;

  // --- commercial ---
  const cd = wizardData.commercialData;
  const commercial = cd
    ? {
        purpose: cd.purpose
          ? pickWithConflict<'shop' | 'restaurant' | 'warehouse' | 'production' | 'showroom' | 'other'>(
              'commercial.purpose',
              [{ value: cd.purpose, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        currentState: cd.currentState
          ? pickWithConflict<'greenfield' | 'existing_building' | 'existing_renovation'>(
              'commercial.currentState',
              [{ value: cd.currentState, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        floorType: cd.floor?.type
          ? pickWithConflict<string>('commercial.floorType', [{ value: cd.floor.type, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        floorLoadCapacityKgM2: cd.floor?.loadCapacity && cd.floor.loadCapacity > 0
          ? pickWithConflict<number>('commercial.floorLoadCapacityKgM2', [{ value: cd.floor.loadCapacity, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        floorAntiStatic: cd.floor?.antiStatic !== undefined
          ? pickWithConflict<boolean>('commercial.floorAntiStatic', [{ value: !!cd.floor.antiStatic, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        fireRating: cd.fireRating !== undefined
          ? pickWithConflict<boolean>('commercial.fireRating', [{ value: !!cd.fireRating, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        hvac: cd.hvac !== undefined
          ? pickWithConflict<boolean>('commercial.hvac', [{ value: !!cd.hvac, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        heavyDutyElectrical: cd.heavyDutyElectrical !== undefined
          ? pickWithConflict<boolean>('commercial.heavyDutyElectrical', [{ value: !!cd.heavyDutyElectrical, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        accessControl: cd.accessControl !== undefined
          ? pickWithConflict<boolean>('commercial.accessControl', [{ value: !!cd.accessControl, source: 'wizard' as FactSource }], conflicts)
          : undefined,
        surveillance: cd.surveillance !== undefined
          ? pickWithConflict<boolean>('commercial.surveillance', [{ value: !!cd.surveillance, source: 'wizard' as FactSource }], conflicts)
          : undefined,
      }
    : undefined;

  // --- foundation ---
  const wizardFoundation =
    wizardData.houseData?.foundation
    ?? wizardData.townhouseData?.houseData?.foundation;
  const foundation = wizardFoundation
    ? {
        type: wizardFoundation.type
          ? pickWithConflict<'strip' | 'slab' | 'pile' | 'combined'>(
              'foundation.type',
              [{ value: wizardFoundation.type, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        depthM: parseNumeric(wizardFoundation.depth) !== undefined
          ? pickWithConflict<number>(
              'foundation.depthM',
              [{ value: parseNumeric(wizardFoundation.depth)!, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        widthM: parseNumeric(wizardFoundation.width) !== undefined
          ? pickWithConflict<number>(
              'foundation.widthM',
              [{ value: parseNumeric(wizardFoundation.width)!, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        waterproofing: wizardFoundation.waterproofing !== undefined
          ? pickWithConflict<boolean>(
              'foundation.waterproofing',
              [{ value: !!wizardFoundation.waterproofing, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        insulation: wizardFoundation.insulation !== undefined
          ? pickWithConflict<boolean>(
              'foundation.insulation',
              [{ value: !!wizardFoundation.insulation, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        insulationThicknessMm: wizardFoundation.insulationThickness !== undefined
          ? pickWithConflict<number>(
              'foundation.insulationThicknessMm',
              [{ value: wizardFoundation.insulationThickness, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        reinforcement: wizardFoundation.reinforcement
          ? pickWithConflict<'light' | 'standard' | 'heavy'>(
              'foundation.reinforcement',
              [{ value: wizardFoundation.reinforcement, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
      }
    : undefined;

  // --- roof ---
  const wizardRoof =
    wizardData.houseData?.roof
    ?? wizardData.townhouseData?.houseData?.roof;
  const roof = wizardRoof
    ? {
        type: wizardRoof.type
          ? pickWithConflict<'pitched' | 'flat' | 'mansard' | 'combined'>(
              'roof.type',
              [{ value: wizardRoof.type, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        material: wizardRoof.material
          ? pickWithConflict<string>(
              'roof.material',
              [{ value: wizardRoof.material, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        pitchAngleDeg: wizardRoof.pitchAngle !== undefined
          ? pickWithConflict<number>(
              'roof.pitchAngleDeg',
              [{ value: wizardRoof.pitchAngle, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        insulation: wizardRoof.insulation !== undefined
          ? pickWithConflict<boolean>(
              'roof.insulation',
              [{ value: !!wizardRoof.insulation, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        insulationThicknessMm: wizardRoof.insulationThickness !== undefined
          ? pickWithConflict<number>(
              'roof.insulationThicknessMm',
              [{ value: wizardRoof.insulationThickness, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        attic: wizardRoof.attic
          ? pickWithConflict<'cold' | 'warm' | 'living'>(
              'roof.attic',
              [{ value: wizardRoof.attic, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        gutterSystem: wizardRoof.gutterSystem !== undefined
          ? pickWithConflict<boolean>(
              'roof.gutterSystem',
              [{ value: !!wizardRoof.gutterSystem, source: 'wizard' as FactSource }],
              conflicts
            )
          : undefined,
        roofWindows: wizardRoof.roofWindows !== undefined && wizardRoof.roofWindows > 0
          ? pickWithConflict<number>(
              'roof.roofWindows',
              [{ value: wizardRoof.roofWindows, source: 'wizard' as FactSource }],
              conflicts
            )
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
  const wizardDemoDescription =
    wizardData.houseData?.demolitionDescription
    ?? wizardData.townhouseData?.demolitionDescription
    ?? wizardData.commercialData?.demolitionDescription;
  const demolitionDescription = wizardDemoDescription
    ? pickWithConflict<string>(
        'demolitionDescription',
        [{ value: wizardDemoDescription, source: 'wizard' as FactSource }],
        conflicts
      )
    : undefined;

  return {
    objectType,
    area,
    floors,
    ceilingHeight,
    walls: (wallMaterialValue || wallThicknessValue || wallInsulation || wallInsulationType ||
            wallInsulationThickness || wallLoadBearing || wallPartition) ? {
      material: wallMaterialValue,
      thicknessMm: wallThicknessValue,
      insulation: wallInsulation,
      insulationType: wallInsulationType,
      insulationThicknessMm: wallInsulationThickness,
      hasLoadBearing: wallLoadBearing,
      partitionMaterial: wallPartition,
    } : undefined,
    electrical,
    plumbing,
    heating,
    ventilation,
    geology,
    foundation,
    roof,
    finishing,
    openings,
    extras,
    renovation,
    commercial,
    demolitionRequired,
    demolitionDescription,
    conflicts,
  };
}
