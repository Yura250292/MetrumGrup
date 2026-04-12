/**
 * Bid Intelligence & Structured Engineer Report Types
 *
 * Used by BidIntelligenceService and EngineerReportModal
 */

// ============================================================
// BID INTELLIGENCE TYPES
// ============================================================

export interface EnrichedTenderMatch {
  tenderID: string;
  title: string;
  budget: number;
  awardedAmount?: number;
  discount?: number; // % знижка від бюджету (від'ємне = нижче бюджету)
  similarityScore: number; // 0-100
  scoreBreakdown: {
    budgetProximity: number;    // max 35
    scopeSimilarity: number;    // max 25
    winnerAvailability: number; // max 10
    region: number;             // max 10
    recency: number;            // max 10
    cpv: number;                // max 10
  };
  procuringEntity?: string;
  datePublished?: string;
  status?: string;
  city?: string;
  cpvCode?: string;
  itemsCount: number;
}

export interface BudgetBand {
  label: 'core' | 'near' | 'context';
  range: { min: number; max: number };
  percentage: number; // 10, 20, or 30
  tenders: EnrichedTenderMatch[];
}

export interface WinnerPriceAnalysis {
  medianWinnerPrice: number;
  avgDiscount: number;      // типова знижка % від очікуваного бюджету
  minDiscount: number;
  maxDiscount: number;
  winCorridor: { low: number; high: number };
  sampleSize: number;        // скільки тендерів мають awardedAmount
}

export interface EntryPriceRecommendation {
  recommended: { min: number; max: number };
  aggressive: { min: number; max: number };
  conservative: { min: number; max: number };
  basedOnWinnersMedian: number;
  basedOnExpectedMedian: number;
  basis: string; // пояснення
}

export interface MarketSignals {
  competitionLevel: 'low' | 'medium' | 'high';
  avgBiddersPerTender: number;
  regionFactor: string;   // "Ціни в регіоні нижчі/вищі за середні"
  dateFactor: string;     // "Сезонний фактор"
  trendDirection: 'rising' | 'stable' | 'falling';
}

export interface AggregatedLocationData {
  location: string;
  city: string;
  totalAmount: number;
  tenderCount: number;
  tenders: Array<{
    title: string;
    amount: number;
    tenderID?: string;
    status: string;
  }>;
}

export interface BidIntelligenceResult {
  targetBudget: number;
  budgetBands: BudgetBand[];
  winnerAnalysis: WinnerPriceAnalysis;
  entryPrice: EntryPriceRecommendation;
  marketSignals: MarketSignals;
  allMatches: EnrichedTenderMatch[];
  aggregatedLocations: AggregatedLocationData[];
  priceDatabase: Record<string, number>;
  searchMeta: {
    queries: string[];
    totalFound: number;
    searchedAt: string;
  };
}

// ============================================================
// STRUCTURED ENGINEER REPORT TYPES
// ============================================================

export interface ExecutionStage {
  order: number;
  name: string;
  goal: string;
  prerequisites: string[];
  estimatedDuration?: string;
  risks: string[];
  controlPoints: string[];
  dependsOn: number[]; // order номери етапів, від яких залежить
}

export interface ChecklistItem {
  category: 'permits' | 'design' | 'logistics' | 'safety' | 'utilities' | 'other';
  item: string;
  critical: boolean;
}

export interface RiskWarning {
  severity: 'high' | 'medium' | 'low';
  area: string;          // "документація", "геологія", "логістика" тощо
  description: string;
  mitigation: string;
}

export interface StructuredEngineerReport {
  version: 2;
  projectUnderstanding: {
    objectType: string;
    scope: string;
    area?: number;
    floors?: number;
    keyParameters: Record<string, string>;
    documentsAnalyzed: string[];
  };
  assumptions: string[];
  missingInputs: string[];
  executionSequence: ExecutionStage[];
  tenderStrategy?: {
    recommendedEntryRange: [number, number];
    comments: string[];
  };
  preStartChecklist: ChecklistItem[];
  criticalDependencies: string[];
  riskWarnings: RiskWarning[];
}

// ============================================================
// SERVICE INPUT TYPE
// ============================================================

export interface BidIntelligenceInput {
  estimateAmount: number;
  wizardData?: {
    objectType?: string;
    workScope?: string;
    totalArea?: string;
    floors?: string;
    commercialData?: {
      purpose?: string;
      hvac?: boolean;
    };
  };
  searchQuery?: string;
  estimateTitle?: string;
  estimateDescription?: string;
  sections?: Array<{ title: string; items: Array<{ description: string }> }>;
}
