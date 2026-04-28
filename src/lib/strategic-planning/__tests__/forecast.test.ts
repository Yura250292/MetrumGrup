import { buildForecast } from "../forecast";
import type {
  CustomItem,
  EmployeeDTO,
  ForecastInput,
  ProjectDTO,
  TemplateDTO,
} from "../types";

function makeInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    period: { startMonth: "2026-05-01", durationMonths: 6 },
    openingBalance: 0,
    projects: [],
    selectedProjectIds: [],
    projectOverrides: {},
    employees: [],
    selectedEmployeeIds: [],
    templates: [],
    selectedTemplateIds: [],
    customItems: [],
    ...overrides,
  };
}

const project6Months: ProjectDTO = {
  id: "p1",
  title: "Project A",
  totalBudget: 600_000,
  totalPaid: 0,
  startDate: "2026-05-01",
  expectedEndDate: "2026-10-31",
};

describe("buildForecast", () => {
  it("розподіляє дохід проекту рівномірно по 6 місяцях", () => {
    const result = buildForecast(
      makeInput({
        projects: [project6Months],
        selectedProjectIds: ["p1"],
      }),
    );
    expect(result.months).toHaveLength(6);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.type).toBe("INCOME");
    expect(row.monthly.every((v) => v === 100_000)).toBe(true);
    expect(row.total).toBe(600_000);
    expect(result.summary.totalIncome).toBe(600_000);
  });

  it("override перекриває рівномірний розподіл", () => {
    const result = buildForecast(
      makeInput({
        projects: [project6Months],
        selectedProjectIds: ["p1"],
        projectOverrides: { p1: { monthlyAmount: 80_000 } },
      }),
    );
    expect(result.rows[0].monthly).toEqual([80_000, 80_000, 80_000, 80_000, 80_000, 80_000]);
  });

  it("співробітник із burden 0.4 додає 70k витрат за місяць × 3", () => {
    const emp: EmployeeDTO = {
      id: "e1",
      fullName: "Іван",
      position: null,
      salaryType: "MONTHLY",
      salaryAmount: 50_000,
      burdenMultiplier: 0.4,
    };
    const result = buildForecast(
      makeInput({
        period: { startMonth: "2026-05-01", durationMonths: 3 },
        employees: [emp],
        selectedEmployeeIds: ["e1"],
      }),
    );
    expect(result.rows[0].monthly).toEqual([70_000, 70_000, 70_000]);
    expect(result.summary.totalExpense).toBe(210_000);
  });

  it("шаблон 30k × 6 = 180k витрат", () => {
    const tpl: TemplateDTO = {
      id: "t1",
      name: "Оренда офісу",
      defaultAmount: 30_000,
      category: "rent",
      emoji: null,
      folderName: "Постійні витрати",
    };
    const result = buildForecast(
      makeInput({
        templates: [tpl],
        selectedTemplateIds: ["t1"],
      }),
    );
    expect(result.summary.totalExpense).toBe(180_000);
    expect(result.rows[0].monthly.every((v) => v === 30_000)).toBe(true);
  });

  it("custom ONE_TIME з’являється тільки в указаному місяці", () => {
    const item: CustomItem = {
      id: "c1",
      label: "Аванс",
      type: "INCOME",
      amount: 200_000,
      mode: "ONE_TIME",
      startMonthIndex: 2,
      durationMonths: 1,
    };
    const result = buildForecast(makeInput({ customItems: [item] }));
    expect(result.rows[0].monthly).toEqual([0, 0, 200_000, 0, 0, 0]);
    expect(result.summary.totalIncome).toBe(200_000);
  });

  it("running balance + minBalance", () => {
    const incomeItem: CustomItem = {
      id: "in",
      label: "Дохід",
      type: "INCOME",
      amount: 50_000,
      mode: "ONE_TIME",
      startMonthIndex: 0,
      durationMonths: 1,
    };
    const expenseItem: CustomItem = {
      id: "out",
      label: "Витрата",
      type: "EXPENSE",
      amount: 20_000,
      mode: "ONE_TIME",
      startMonthIndex: 1,
      durationMonths: 1,
    };
    const incomeItem3: CustomItem = {
      ...incomeItem,
      id: "in3",
      amount: 30_000,
      startMonthIndex: 2,
    };
    const result = buildForecast(
      makeInput({
        period: { startMonth: "2026-05-01", durationMonths: 3 },
        openingBalance: 100_000,
        customItems: [incomeItem, expenseItem, incomeItem3],
      }),
    );
    expect(result.totals.netByMonth).toEqual([50_000, -20_000, 30_000]);
    expect(result.totals.runningBalance).toEqual([150_000, 130_000, 160_000]);
    expect(result.summary.minBalance).toBe(130_000);
    expect(result.summary.minBalanceMonthIndex).toBe(1);
  });

  it("проект із expectedEndDate раніше горизонту обмежує активні місяці", () => {
    const shortProject: ProjectDTO = {
      ...project6Months,
      totalBudget: 200_000,
      expectedEndDate: "2026-06-30", // лише 2 місяці у горизонті 6
    };
    const result = buildForecast(
      makeInput({
        projects: [shortProject],
        selectedProjectIds: ["p1"],
      }),
    );
    const monthly = result.rows[0].monthly;
    expect(monthly.slice(0, 2)).toEqual([100_000, 100_000]);
    expect(monthly.slice(2)).toEqual([0, 0, 0, 0]);
    expect(result.summary.totalIncome).toBe(200_000);
  });
});
