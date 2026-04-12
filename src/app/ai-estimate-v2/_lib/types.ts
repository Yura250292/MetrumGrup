// Domain types — kept in sync with legacy /admin/estimates/ai-generate/page.tsx.
// Local copy so v2 doesn't import from a 5800-line "use client" file.

export type EstimateItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
  priceSource?: string | null;
  priceNote?: string | null;
  // Quantity engine metadata (Phase 3.2 — pass-through)
  itemType?: string;
  engineKey?: string;
  quantityFormula?: string;
  // Price engine metadata (pass-through)
  priceSourceType?: string;
  confidence?: number;
};

export type EstimateSection = {
  title: string;
  items: EstimateItem[];
  sectionTotal: number;
};

export type EstimateData = {
  title: string;
  description?: string;
  area?: string;
  areaSource?: string;
  sections: EstimateSection[];
  summary?: {
    materialsCost?: number;
    laborCost?: number;
    overheadPercent?: number;
    overheadCost?: number;
    totalBeforeDiscount?: number;
    recommendations?: string;
  };
  // Optional metadata returned by the chunked endpoint
  analysisSummary?: any;
  prozorroAnalysis?: any;
  structuredReport?: any;
  bidIntelligence?: any;
  scalingInfo?: ScalingInfo | null;
};

export type ScalingInfo = {
  originalArea?: number;
  targetArea?: number;
  ratio?: number;
  message?: string;
};

export type VerificationIssue = {
  severity?: "critical" | "warning" | "info" | "error" | string;
  category?: "calculation" | "pricing" | "completeness" | "logic" | "specifications" | string;
  description?: string;
  message?: string;
  suggestion?: string;
  recommendation?: string;
  location?: string;
  expected?: string | number;
  actual?: string | number;
  sectionIndex?: number;
  itemIndex?: number;
};

export type VerificationImprovement = {
  type?: "add" | "modify" | "remove";
  sectionIndex?: number;
  itemIndex?: number;
  description?: string;
  suggestedChange?: {
    field?: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
  };
};

export type VerificationResult = {
  status?: string;
  overallScore?: number;
  issues?: VerificationIssue[];
  improvements?: VerificationImprovement[];
  summary?: string;
} | null;

export type PreAnalysisData = {
  classification?: any;
  parsedData?: any;
  filesAnalyzed?: number;
  // Loose shape — backend evolves
  [key: string]: any;
} | null;

export type ChunkedProgress = {
  phase?: string;
  status?: string;
  message?: string;
  progress?: number;
  data?: any;
} | null;

export type ProjectListItem = {
  id: string;
  title: string;
  client?: { name?: string } | null;
};

export type SupplementProgress = {
  message?: string;
  progress: number;
} | null;
