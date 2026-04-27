export type FinanceEntryStatus = "DRAFT" | "PENDING" | "APPROVED" | "PAID";
export type FinanceEntrySource = "MANUAL" | "ESTIMATE_AUTO";
export type CostType = "MATERIAL" | "LABOR" | "SUBCONTRACT" | "EQUIPMENT" | "OVERHEAD" | "OTHER";

export type CounterpartyOption = {
  id: string;
  name: string;
  type: "LEGAL" | "INDIVIDUAL" | "FOP";
};

export type CostCodeOption = {
  id: string;
  code: string;
  name: string;
};

export type FinanceEntryDTO = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  projectId: string | null;
  folderId: string | null;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  counterparty: string | null;
  counterpartyId: string | null;
  counterpartyEntity: CounterpartyOption | null;
  costCodeId: string | null;
  costType: CostType | null;
  costCode: CostCodeOption | null;
  isArchived: boolean;
  status: FinanceEntryStatus;
  source: FinanceEntrySource;
  estimateId: string | null;
  estimateItemId: string | null;
  estimate: { id: string; number: string; title: string } | null;
  approvedAt: string | null;
  approvedById: string | null;
  paidAt: string | null;
  remindAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string; slug: string } | null;
  folder: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
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
  folderId?: string;
  folderName?: string;
};

export const EMPTY_SUMMARY: FinanceSummaryDTO = {
  plan: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  fact: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  balance: 0,
  count: 0,
};

export type FinancingFilters = {
  projectId: string;
  folderId: string;
  category: string;
  costCodeId: string;
  costType: string;
  counterpartyId: string;
  from: string;
  to: string;
  search: string;
  kind: string;
  type: string;
  status: string;
  source: string;
  subcategory: string;
  responsibleId: string;
  hasAttachments: string;
  archived: boolean;
};

export const FINANCE_STATUS_LABELS: Record<FinanceEntryStatus, string> = {
  DRAFT: "Чернетка",
  PENDING: "На погодженні",
  APPROVED: "Підтверджено",
  PAID: "Оплачено",
};

export const FINANCE_STATUS_COLORS: Record<FinanceEntryStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
};
