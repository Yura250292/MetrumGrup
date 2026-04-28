// Public DTOs the server page passes into the client calculator.
// All `Decimal` fields are pre-converted to plain numbers on the server.

export type ProjectDTO = {
  id: string;
  title: string;
  totalBudget: number;
  totalPaid: number;
  startDate: string | null; // ISO
  expectedEndDate: string | null; // ISO
};

export type EmployeeDTO = {
  id: string;
  fullName: string;
  position: string | null;
  salaryType: "MONTHLY" | "HOURLY";
  salaryAmount: number;
  burdenMultiplier: number | null;
};

export type TemplateDTO = {
  id: string;
  name: string;
  defaultAmount: number;
  category: string;
  emoji: string | null;
  folderName: string;
};

export type InitialData = {
  projects: ProjectDTO[];
  employees: EmployeeDTO[];
  templates: TemplateDTO[];
};

// Calculator state types

export type Period = {
  /** ISO start of month — local TZ. */
  startMonth: string;
  /** 1..24 */
  durationMonths: number;
};

export type ProjectOverride = {
  /** Якщо задано — заміняє рівномірне розподіл доходу проекту. ₴ на місяць. */
  monthlyAmount: number;
};

export type CustomItem = {
  id: string;
  label: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  mode: "MONTHLY" | "ONE_TIME";
  /** Index into months[] (0..durationMonths-1). */
  startMonthIndex: number;
  /** Лише для MONTHLY. 1..durationMonths. */
  durationMonths: number;
};

export type ForecastInput = {
  period: Period;
  openingBalance: number;
  projects: ProjectDTO[];
  selectedProjectIds: string[];
  projectOverrides: Record<string, ProjectOverride>;
  employees: EmployeeDTO[];
  selectedEmployeeIds: string[];
  templates: TemplateDTO[];
  selectedTemplateIds: string[];
  customItems: CustomItem[];
};

export type RowKind = "PROJECT" | "STAFF" | "TEMPLATE" | "CUSTOM";

export type ForecastRow = {
  id: string;
  label: string;
  kind: RowKind;
  type: "INCOME" | "EXPENSE";
  /** Сума на кожен місяць горизонту. Довжина = months.length. */
  monthly: number[];
  total: number;
};

export type ForecastTotals = {
  incomeByMonth: number[];
  expenseByMonth: number[];
  netByMonth: number[];
  runningBalance: number[];
};

export type ForecastSummary = {
  totalIncome: number;
  totalExpense: number;
  netPL: number;
  /** Найнижча точка running balance. */
  minBalance: number;
  /** Індекс місяця з мінімальним балансом. */
  minBalanceMonthIndex: number;
};

export type ForecastResult = {
  /** Перший день кожного місяця горизонту. */
  months: Date[];
  rows: ForecastRow[];
  totals: ForecastTotals;
  summary: ForecastSummary;
};

/** Для HOURLY співробітників — грубе наближення «годин на місяць». */
export const HOURS_PER_MONTH = 168;
