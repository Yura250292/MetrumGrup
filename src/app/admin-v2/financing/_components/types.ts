export type FinanceEntryStatus = "DRAFT" | "PENDING" | "APPROVED" | "PAID";

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
  status: FinanceEntryStatus;
  approvedAt: string | null;
  approvedById: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string; slug: string } | null;
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
  status: string;
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
