export type FinanceEntryDTO = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  projectId: string | null;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  counterparty: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string; slug: string } | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    r2Key: string;
    createdAt: string;
  }>;
};

export type QuadrantStats = { sum: number; count: number };

export type FinanceSummaryDTO = {
  plan: { income: QuadrantStats; expense: QuadrantStats };
  fact: { income: QuadrantStats; expense: QuadrantStats };
  balance: number;
  count: number;
};

export type ProjectOption = { id: string; title: string };

export type UserOption = { id: string; name: string };

export type QuadrantPreset = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
};

export const EMPTY_SUMMARY: FinanceSummaryDTO = {
  plan: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  fact: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  balance: 0,
  count: 0,
};

export type FinancingFilters = {
  projectId: string;
  category: string;
  from: string;
  to: string;
  search: string;
  kind: string;
  type: string;
  subcategory: string;
  responsibleId: string;
  hasAttachments: string;
  archived: boolean;
};
