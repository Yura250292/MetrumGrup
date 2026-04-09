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
  };

  electrical?: {
    outlets?: SourcedValue<number>;
    switches?: SourcedValue<number>;
    lightPoints?: SourcedValue<number>;
  };

  plumbing?: {
    waterPoints?: SourcedValue<number>;
    sewerPoints?: SourcedValue<number>;
  };

  heating?: {
    type?: SourcedValue<string>;
    radiators?: SourcedValue<number>;
    underfloorAreaM2?: SourcedValue<number>;
  };

  geology?: {
    groundwaterLevelM?: SourcedValue<number>;
    soilType?: SourcedValue<string>;
  };

  finishing?: {
    tileAreaM2?: SourcedValue<number>;
    laminateAreaM2?: SourcedValue<number>;
  };

  demolitionRequired?: SourcedValue<boolean>;

  /**
   * Records every field where multiple sources disagreed. Useful for the
   * UI "review queue" and for surfacing data-quality issues to the user.
   */
  conflicts: ProjectFactsConflict[];
};
