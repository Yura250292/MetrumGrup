import type { IncomingDocumentType } from "@prisma/client";

export interface ExtractedItem {
  name: string;
  qty?: number;
  unit?: string;
  price?: number;
  total?: number;
}

export interface ExtractedCounterparty {
  name?: string;
  edrpou?: string;
  iban?: string;
  taxId?: string;
}

export interface ExtractedProjectHint {
  keyword?: string;
  address?: string;
}

export interface CostCodeSuggestion {
  code: string;
  label: string;
  confidence: number;
}

export interface ExtractedData {
  type: IncomingDocumentType;
  counterparty?: ExtractedCounterparty;
  project?: ExtractedProjectHint;
  costCodeSuggestions?: CostCodeSuggestion[];
  amountTotal?: number;
  amountVat?: number;
  currency?: string;
  documentDate?: string;
  documentNumber?: string;
  paymentTermsDays?: number;
  items?: ExtractedItem[];
  raw: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
}

export interface DocumentPrompt {
  type: IncomingDocumentType;
  /** Інструкція для AI: що саме видобути, у якому форматі повернути JSON. */
  prompt: string;
}
