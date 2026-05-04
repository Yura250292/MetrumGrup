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

/// Один історичний період ЗП (для forecast: місяць → активний період).
/// Дати у ISO-стрінгах, конвертовані на сервері.
export type SalaryPeriodDTO = {
  baseSalary: number;
  coefficient: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

export type EmployeeDTO = {
  id: string;
  fullName: string;
  position: string | null;
  /// Історія періодів ЗП. Forecast обходить місяці і знаходить активний на кожен.
  salaries: SalaryPeriodDTO[];
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

/// Знаходить активний період ЗП на конкретну дату.
export function pickSalaryPeriod(
  periods: SalaryPeriodDTO[],
  asOf: Date,
): SalaryPeriodDTO | null {
  const t = asOf.getTime();
  let best: SalaryPeriodDTO | null = null;
  let bestStart = -Infinity;
  for (const s of periods) {
    const start = new Date(s.effectiveFrom).getTime();
    const end = s.effectiveTo ? new Date(s.effectiveTo).getTime() : Infinity;
    if (start <= t && t <= end && start > bestStart) {
      best = s;
      bestStart = start;
    }
  }
  return best;
}

/// Місячна ЗП (Оклад + Коеф) на дату. 0 якщо запису ще не було.
export function monthlySalaryAt(
  periods: SalaryPeriodDTO[],
  asOf: Date,
): number {
  const p = pickSalaryPeriod(periods, asOf);
  if (!p) return 0;
  return p.baseSalary + p.coefficient;
}

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

