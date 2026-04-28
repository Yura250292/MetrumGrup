import {
  addMonths,
  eachMonthOfInterval,
  endOfMonth,
  isBefore,
  startOfMonth,
} from "date-fns";

import {
  HOURS_PER_MONTH,
  type ForecastInput,
  type ForecastResult,
  type ForecastRow,
  type ProjectDTO,
} from "./types";

function buildMonths(startISO: string, duration: number): Date[] {
  const start = startOfMonth(new Date(startISO));
  const safeDuration = Math.max(1, Math.min(24, Math.round(duration)));
  const end = startOfMonth(addMonths(start, safeDuration - 1));
  return eachMonthOfInterval({ start, end });
}

function projectMonthly(
  project: ProjectDTO,
  months: Date[],
  override: number | undefined,
): number[] {
  const monthly = new Array<number>(months.length).fill(0);
  if (months.length === 0) return monthly;

  const horizonStart = months[0];
  const horizonEnd = endOfMonth(months[months.length - 1]);
  const projectStart = project.startDate
    ? startOfMonth(new Date(project.startDate))
    : horizonStart;
  const projectEnd = project.expectedEndDate
    ? startOfMonth(new Date(project.expectedEndDate))
    : months[months.length - 1];

  // Активні місяці: ті, що лежать у перетині [projectStart, projectEnd] і горизонту.
  const activeIndices: number[] = [];
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (isBefore(m, projectStart)) continue;
    if (isBefore(projectEnd, m)) continue;
    if (isBefore(horizonEnd, m)) continue;
    activeIndices.push(i);
  }

  if (activeIndices.length === 0) return monthly;

  if (override !== undefined && override > 0) {
    for (const idx of activeIndices) monthly[idx] = override;
    return monthly;
  }

  const remaining = Math.max(0, project.totalBudget - project.totalPaid);
  if (remaining === 0) return monthly;
  const perMonth = remaining / activeIndices.length;
  for (const idx of activeIndices) monthly[idx] = perMonth;
  return monthly;
}

export function buildForecast(input: ForecastInput): ForecastResult {
  const months = buildMonths(input.period.startMonth, input.period.durationMonths);
  const rows: ForecastRow[] = [];

  // 1. Проекти (дохід)
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  for (const id of input.selectedProjectIds) {
    const p = projectsById.get(id);
    if (!p) continue;
    const override = input.projectOverrides[id]?.monthlyAmount;
    const monthly = projectMonthly(p, months, override);
    rows.push({
      id: `project:${p.id}`,
      label: p.title,
      kind: "PROJECT",
      type: "INCOME",
      monthly,
      total: monthly.reduce((s, v) => s + v, 0),
    });
  }

  // 2. Співробітники (постійна витрата)
  const employeesById = new Map(input.employees.map((e) => [e.id, e]));
  for (const id of input.selectedEmployeeIds) {
    const emp = employeesById.get(id);
    if (!emp) continue;
    const burden = emp.burdenMultiplier ?? 0;
    const base =
      emp.salaryType === "MONTHLY"
        ? emp.salaryAmount
        : emp.salaryAmount * HOURS_PER_MONTH;
    const monthlyCost = base * (1 + burden);
    const monthly = new Array<number>(months.length).fill(monthlyCost);
    rows.push({
      id: `staff:${emp.id}`,
      label: emp.position ? `${emp.fullName} — ${emp.position}` : emp.fullName,
      kind: "STAFF",
      type: "EXPENSE",
      monthly,
      total: monthlyCost * months.length,
    });
  }

  // 3. Шаблони постійних витрат
  const templatesById = new Map(input.templates.map((t) => [t.id, t]));
  for (const id of input.selectedTemplateIds) {
    const t = templatesById.get(id);
    if (!t) continue;
    const monthly = new Array<number>(months.length).fill(t.defaultAmount);
    rows.push({
      id: `template:${t.id}`,
      label: t.emoji ? `${t.emoji} ${t.name}` : t.name,
      kind: "TEMPLATE",
      type: "EXPENSE",
      monthly,
      total: t.defaultAmount * months.length,
    });
  }

  // 4. Custom items
  for (const c of input.customItems) {
    const monthly = new Array<number>(months.length).fill(0);
    const startIdx = Math.max(0, Math.min(months.length - 1, c.startMonthIndex));
    if (c.mode === "ONE_TIME") {
      monthly[startIdx] = c.amount;
    } else {
      const span = Math.max(1, Math.min(months.length - startIdx, c.durationMonths));
      for (let i = startIdx; i < startIdx + span; i++) monthly[i] = c.amount;
    }
    rows.push({
      id: `custom:${c.id}`,
      label: c.label || (c.type === "INCOME" ? "Власний дохід" : "Власна витрата"),
      kind: "CUSTOM",
      type: c.type,
      monthly,
      total: monthly.reduce((s, v) => s + v, 0),
    });
  }

  // Підсумки по місяцях
  const incomeByMonth = new Array<number>(months.length).fill(0);
  const expenseByMonth = new Array<number>(months.length).fill(0);
  for (const r of rows) {
    const target = r.type === "INCOME" ? incomeByMonth : expenseByMonth;
    for (let i = 0; i < months.length; i++) target[i] += r.monthly[i];
  }
  const netByMonth = months.map((_, i) => incomeByMonth[i] - expenseByMonth[i]);

  // Running balance
  const runningBalance = new Array<number>(months.length).fill(0);
  let acc = input.openingBalance;
  for (let i = 0; i < months.length; i++) {
    acc += netByMonth[i];
    runningBalance[i] = acc;
  }

  const totalIncome = incomeByMonth.reduce((s, v) => s + v, 0);
  const totalExpense = expenseByMonth.reduce((s, v) => s + v, 0);
  let minBalance = Infinity;
  let minBalanceMonthIndex = 0;
  if (runningBalance.length === 0) {
    minBalance = input.openingBalance;
  } else {
    runningBalance.forEach((v, i) => {
      if (v < minBalance) {
        minBalance = v;
        minBalanceMonthIndex = i;
      }
    });
  }

  return {
    months,
    rows,
    totals: { incomeByMonth, expenseByMonth, netByMonth, runningBalance },
    summary: {
      totalIncome,
      totalExpense,
      netPL: totalIncome - totalExpense,
      minBalance,
      minBalanceMonthIndex,
    },
  };
}
