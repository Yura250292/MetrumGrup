/**
 * ProjectFacts — normalized, source-tagged view of a project.
 *
 * The current AI generator pipeline reads a mix of `wizardData`, parsed
 * specs, drawing extractions, RAG snippets, and inferred defaults. None of
 * those have a single canonical structure, which makes deterministic
 * quantity rules impossible to write.
 *
 * `ProjectFacts` is the staging point: every numeric/categorical fact about
 * the project lives here, tagged with its source and confidence. Phase 3 of
 * the master plan will plug a rule-based quantity engine on top of this
 * structure; for now we just build it and pass it through `AgentContext`
 * so existing agents can start using it incrementally.
 */

export type FactSource = 'wizard' | 'spec' | 'drawing' | 'rag' | 'inferred';

export const SOURCE_PRIORITY: Record<FactSource, number> = {
  wizard: 5,
  spec: 4,
  drawing: 3,
  rag: 2,
  inferred: 1,
};

export const SOURCE_CONFIDENCE: Record<FactSource, number> = {
  wizard: 1.0,
  spec: 0.9,
  drawing: 0.8,
  rag: 0.7,
  inferred: 0.4,
};

export type SourcedValue<T> = {
  value: T;
  source: FactSource;
  confidence: number;
};

export type ProjectObjectType =
  | 'house'
  | 'townhouse'
  | 'apartment'
  | 'office'
  | 'commercial'
  | 'other';

export type ProjectFactsConflict = {
  field: string;
  sources: Array<{ source: FactSource; value: unknown }>;
  chosen: FactSource;
};

export type ProjectFacts = {
  objectType: SourcedValue<ProjectObjectType>;
  area: SourcedValue<number>;
  floors?: SourcedValue<number>;
  ceilingHeight?: SourcedValue<number>;

  walls?: {
    material?: SourcedValue<string>;
    thicknessMm?: SourcedValue<number>;
    insulation?: SourcedValue<boolean>;
    insulationType?: SourcedValue<'foam' | 'mineral' | 'ecowool'>;
    insulationThicknessMm?: SourcedValue<number>;
    hasLoadBearing?: SourcedValue<boolean>;
    partitionMaterial?: SourcedValue<'gasblock' | 'brick' | 'gypsum' | 'same'>;
  };

  electrical?: {
    power?: SourcedValue<'single_phase' | 'three_phase'>;
    capacityKw?: SourcedValue<number>;
    outlets?: SourcedValue<number>;
    switches?: SourcedValue<number>;
    lightPoints?: SourcedValue<number>;
    outdoorLighting?: SourcedValue<boolean>;
    needsConnection?: SourcedValue<boolean>;
    connectionDistanceM?: SourcedValue<number>;
    needsTransformer?: SourcedValue<boolean>;
  };

  plumbing?: {
    coldWater?: SourcedValue<boolean>;
    hotWater?: SourcedValue<boolean>;
    source?: SourcedValue<'central' | 'well' | 'borehole'>;
    boilerType?: SourcedValue<'gas' | 'electric' | 'none'>;
    boilerVolumeL?: SourcedValue<number>;
    needsConnection?: SourcedValue<boolean>;
    connectionDistanceM?: SourcedValue<number>;
    needsPump?: SourcedValue<boolean>;
    waterPoints?: SourcedValue<number>;
    sewerPoints?: SourcedValue<number>;
    sewerageType?: SourcedValue<'central' | 'septic' | 'treatment'>;
    sewerPumpNeeded?: SourcedValue<boolean>;
    sewerNeedsLift?: SourcedValue<boolean>;
  };

  heating?: {
    type?: SourcedValue<string>;
    radiators?: SourcedValue<number>;
    underfloorAreaM2?: SourcedValue<number>;
    boilerPowerKw?: SourcedValue<number>;
    needsGasConnection?: SourcedValue<boolean>;
    gasConnectionDistanceM?: SourcedValue<number>;
  };

  ventilation?: {
    natural?: SourcedValue<boolean>;
    forced?: SourcedValue<boolean>;
    recuperation?: SourcedValue<boolean>;
  };

  geology?: {
    groundwaterLevelM?: SourcedValue<number>;
    soilType?: SourcedValue<string>;
  };

  /**
   * Foundation specs — populated from `wizardData.houseData.foundation` /
   * townhouseData.houseData.foundation. Optional because apartments / offices
   * never have it.
   */
  foundation?: {
    type?: SourcedValue<'strip' | 'slab' | 'pile' | 'combined'>;
    depthM?: SourcedValue<number>;
    widthM?: SourcedValue<number>;
    waterproofing?: SourcedValue<boolean>;
    insulation?: SourcedValue<boolean>;
    insulationThicknessMm?: SourcedValue<number>;
    reinforcement?: SourcedValue<'light' | 'standard' | 'heavy'>;
  };

  /**
   * Roof specs — same source.
   */
  roof?: {
    type?: SourcedValue<'pitched' | 'flat' | 'mansard' | 'combined'>;
    material?: SourcedValue<string>;
    pitchAngleDeg?: SourcedValue<number>;
    insulation?: SourcedValue<boolean>;
    insulationThicknessMm?: SourcedValue<number>;
    attic?: SourcedValue<'cold' | 'warm' | 'living'>;
    gutterSystem?: SourcedValue<boolean>;
    roofWindows?: SourcedValue<number>;
  };

  finishing?: {
    wallMaterial?: SourcedValue<string>;
    qualityLevel?: SourcedValue<'economy' | 'standard' | 'premium'>;
    tileAreaM2?: SourcedValue<number>;
    laminateAreaM2?: SourcedValue<number>;
    parquetAreaM2?: SourcedValue<number>;
    vinylAreaM2?: SourcedValue<number>;
    carpetAreaM2?: SourcedValue<number>;
    epoxyAreaM2?: SourcedValue<number>;
    ceilingType?: SourcedValue<'paint' | 'drywall' | 'suspended' | 'stretch'>;
    ceilingLevels?: SourcedValue<number>;
  };

  openings?: {
    windowsCount?: SourcedValue<number>;
    windowsTotalAreaM2?: SourcedValue<number>;
    windowsType?: SourcedValue<'plastic' | 'wood' | 'aluminum'>;
    windowsGlazing?: SourcedValue<'single' | 'double' | 'triple'>;
    doorsEntrance?: SourcedValue<number>;
    doorsInterior?: SourcedValue<number>;
  };

  /**
   * Гараж / мансарда / підвал — додаткові приміщення для будинку.
   */
  extras?: {
    hasBasement?: SourcedValue<boolean>;
    basementAreaM2?: SourcedValue<number>;
    hasAttic?: SourcedValue<boolean>;
    atticAreaM2?: SourcedValue<number>;
    hasGarage?: SourcedValue<boolean>;
    garageAreaM2?: SourcedValue<number>;
    garageType?: SourcedValue<'attached' | 'detached'>;
  };

  /**
   * Renovation specifics — для apartment / office (renovationData).
   */
  renovation?: {
    currentStage?: SourcedValue<'bare_concrete' | 'rough_walls' | 'rough_floor' | 'utilities_installed' | 'ready_for_finish'>;
    layoutChange?: SourcedValue<boolean>;
    newPartitions?: SourcedValue<boolean>;
    newPartitionsLengthM?: SourcedValue<number>;
    bedrooms?: SourcedValue<number>;
    bathrooms?: SourcedValue<number>;
    kitchen?: SourcedValue<number>;
    living?: SourcedValue<number>;
    other?: SourcedValue<number>;
    /**
     * Які саме роботи потрібні (workRequired у wizard).
     * Зберігається як object тому що це не один single-value, а 15 boolean прапорців.
     */
    workRequired?: SourcedValue<Record<string, boolean>>;
    /**
     * Які роботи вже зроблені (existing у wizard) — щоб не повторювати їх у новому кошторисі.
     */
    existing?: SourcedValue<Record<string, boolean>>;
  };

  /**
   * Commercial specifics — для commercialData.
   */
  commercial?: {
    purpose?: SourcedValue<'shop' | 'restaurant' | 'warehouse' | 'production' | 'showroom' | 'other'>;
    currentState?: SourcedValue<'greenfield' | 'existing_building' | 'existing_renovation'>;
    floorType?: SourcedValue<string>;
    floorLoadCapacityKgM2?: SourcedValue<number>;
    floorAntiStatic?: SourcedValue<boolean>;
    fireRating?: SourcedValue<boolean>;
    hvac?: SourcedValue<boolean>;
    heavyDutyElectrical?: SourcedValue<boolean>;
    accessControl?: SourcedValue<boolean>;
    surveillance?: SourcedValue<boolean>;
  };

  demolitionRequired?: SourcedValue<boolean>;
  demolitionDescription?: SourcedValue<string>;

  /**
   * Records every field where multiple sources disagreed. Useful for the
   * UI "review queue" and for surfacing data-quality issues to the user.
   */
  conflicts: ProjectFactsConflict[];
};
