export type FinanceEntryStatus = "DRAFT" | "PENDING" | "APPROVED" | "PAID";
export type FinanceEntrySource =
  | "MANUAL"
  | "ESTIMATE_AUTO"
  | "PROJECT_BUDGET"
  | "STAGE_AUTO"
  | "FOREMAN_REPORT";
export type FinanceNature =
  | "BUDGET_INCOME"
  | "BUDGET_EXPENSE"
  | "COMMITTED_INCOME"
  | "COMMITTED_EXPENSE"
  | "ACTUAL_INCOME"
  | "ACTUAL_EXPENSE";
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
  financeNature: FinanceNature | null;
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
  /**
   * Safe Finance Migration Phase 4.4: семантичні полиці.
   *   budget       — узгоджений бюджет (BUDGET_INCOME / BUDGET_EXPENSE).
   *   commitments  — обовʼязання (COMMITTED_*).
   *   actualCash   — реальні грошові рухи (ACTUAL_INCOME з FE + SupplierPayment).
   *   unclassified — записи зі financeNature=null (legacy / STAGE_AUTO FACT).
   * Поточні UI можуть продовжувати читати plan/fact; нові — переходять
   * сюди.
   */
  budget: { income: QuadrantStats; expense: QuadrantStats };
  commitments: { income: QuadrantStats; expense: QuadrantStats };
  actualCash: { income: QuadrantStats; expense: QuadrantStats };
  unclassified: { income: QuadrantStats; expense: QuadrantStats };
  balance: number;
  /** Cash position з ACTUAL_INCOME − SupplierPayment. */
  actualCashBalance: number;
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

const EMPTY_STATS: QuadrantStats = { sum: 0, count: 0 };
const EMPTY_PAIR = { income: EMPTY_STATS, expense: EMPTY_STATS };

export const EMPTY_SUMMARY: FinanceSummaryDTO = {
  plan: EMPTY_PAIR,
  fact: EMPTY_PAIR,
  budget: EMPTY_PAIR,
  commitments: EMPTY_PAIR,
  actualCash: EMPTY_PAIR,
  unclassified: EMPTY_PAIR,
  balance: 0,
  actualCashBalance: 0,
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
  financeNature: string;
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

export const FINANCE_NATURE_LABELS: Record<FinanceNature, string> = {
  BUDGET_INCOME: "Бюджет (дохід)",
  BUDGET_EXPENSE: "Бюджет (витрата)",
  COMMITTED_INCOME: "Очікувана оплата",
  COMMITTED_EXPENSE: "Обовʼязання",
  ACTUAL_INCOME: "Факт.надходження",
  ACTUAL_EXPENSE: "Факт.виплата",
};

export const FINANCE_NATURE_SHORT_LABELS: Record<FinanceNature, string> = {
  BUDGET_INCOME: "БЮД",
  BUDGET_EXPENSE: "БЮД",
  COMMITTED_INCOME: "ЗОБ",
  COMMITTED_EXPENSE: "ЗОБ",
  ACTUAL_INCOME: "КЕШ",
  ACTUAL_EXPENSE: "КЕШ",
};

export const FINANCE_NATURE_COLORS: Record<FinanceNature, string> = {
  BUDGET_INCOME: "bg-sky-100 text-sky-800",
  BUDGET_EXPENSE: "bg-sky-100 text-sky-800",
  COMMITTED_INCOME: "bg-amber-100 text-amber-800",
  COMMITTED_EXPENSE: "bg-amber-100 text-amber-800",
  ACTUAL_INCOME: "bg-emerald-100 text-emerald-800",
  ACTUAL_EXPENSE: "bg-emerald-100 text-emerald-800",
};

export const FINANCE_STATUS_COLORS: Record<FinanceEntryStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
};
