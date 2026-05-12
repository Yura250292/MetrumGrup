import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { computeSummary } from "../queries";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let projectFindManyMock: Stub;
let groupByMock: Stub;

describe("computeSummary — PROJECT_BUDGET exclusion", () => {
  beforeEach(() => {
    projectFindManyMock = setStub((prisma as any).project, "findMany");
    groupByMock = setStub((prisma as any).financeEntry, "groupBy");
    groupByMock.mockResolvedValue([] as never);
  });

  it("orphan PROJECT_BUDGET (projectId=null) виключається з агрегації", async () => {
    projectFindManyMock.mockResolvedValue([] as never);

    await computeSummary({ isArchived: false });

    // Phase 4.4: 2 groupBy calls — v1 (kind/type) + v2 (financeNature/type).
    expect(groupByMock).toHaveBeenCalledTimes(2);
    const arg = groupByMock.mock.calls[0][0] as { where: any };
    const exclusions = arg.where.AND[1].NOT.OR;
    expect(exclusions).toContainEqual({
      source: "PROJECT_BUDGET",
      projectId: null,
    });
  });

  it("PROJECT_BUDGET виключається для проєктів із Project.planSource IN (ESTIMATE, STAGE)", async () => {
    projectFindManyMock.mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);

    await computeSummary({ isArchived: false });

    const arg = groupByMock.mock.calls[0][0] as { where: any };
    const exclusions = arg.where.AND[1].NOT.OR;
    expect(exclusions).toContainEqual({
      source: "PROJECT_BUDGET",
      projectId: { in: ["p1", "p2"] },
    });
    expect(exclusions).toContainEqual({
      source: "PROJECT_BUDGET",
      projectId: null,
    });
  });

  it("project.findMany шукає за planSource IN [ESTIMATE, STAGE]", async () => {
    projectFindManyMock.mockResolvedValue([] as never);

    await computeSummary({ isArchived: false });

    expect(projectFindManyMock).toHaveBeenCalledTimes(1);
    const arg = projectFindManyMock.mock.calls[0][0] as { where: any };
    expect(arg.where.planSource).toEqual({ in: ["ESTIMATE", "STAGE"] });
  });

  it("без проєктів із детальним планом — виключаємо лише orphan", async () => {
    projectFindManyMock.mockResolvedValue([] as never);

    await computeSummary({ isArchived: false, firmId: "metrum-studio" });

    const arg = groupByMock.mock.calls[0][0] as { where: any };
    const exclusions = arg.where.AND[1].NOT.OR;
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toEqual({ source: "PROJECT_BUDGET", projectId: null });
  });

  it("сума по quadrants правильно мапиться на plan/fact", async () => {
    projectFindManyMock.mockResolvedValue([] as never);
    // v1 і v2 groupBy виконуються паралельно у Promise.all — порядок викликів
    // не детерміновано. Подаємо обидва моки на одну реалізацію (по `by` keys).
    groupByMock.mockImplementation(((arg: any) => {
      if (Array.isArray(arg.by) && arg.by[0] === "kind") {
        return Promise.resolve([
          { kind: "PLAN", type: "EXPENSE", _sum: { amount: 600000 }, _count: { _all: 1 } },
          { kind: "FACT", type: "INCOME", _sum: { amount: 34800 }, _count: { _all: 1 } },
        ]);
      }
      return Promise.resolve([]);
    }) as never);

    const summary = await computeSummary({ isArchived: false });

    expect(summary.plan.expense.sum).toBe(600000);
    expect(summary.plan.income.sum).toBe(0);
    expect(summary.fact.income.sum).toBe(34800);
    expect(summary.fact.expense.sum).toBe(0);
    expect(summary.balance).toBe(34800);
    expect(summary.count).toBe(2);
  });
});

describe("computeSummary — Phase 4.4 financeNature shelves", () => {
  beforeEach(() => {
    projectFindManyMock = setStub((prisma as any).project, "findMany");
    groupByMock = setStub((prisma as any).financeEntry, "groupBy");
    projectFindManyMock.mockResolvedValue([] as never);
  });

  function mockGroupBy(natureRows: any[]) {
    groupByMock.mockImplementation(((arg: any) => {
      if (Array.isArray(arg.by) && arg.by[0] === "financeNature") {
        return Promise.resolve(natureRows);
      }
      return Promise.resolve([]);
    }) as never);
  }

  it("BUDGET/COMMITMENT/ACTUAL shelves заповнюються з groupBy за financeNature", async () => {
    mockGroupBy([
      { financeNature: "BUDGET_EXPENSE", type: "EXPENSE", _sum: { amount: 100 }, _count: { _all: 1 } },
      { financeNature: "BUDGET_INCOME", type: "INCOME", _sum: { amount: 200 }, _count: { _all: 1 } },
      { financeNature: "COMMITTED_EXPENSE", type: "EXPENSE", _sum: { amount: 50 }, _count: { _all: 1 } },
      { financeNature: "COMMITTED_INCOME", type: "INCOME", _sum: { amount: 75 }, _count: { _all: 1 } },
      { financeNature: "ACTUAL_EXPENSE", type: "EXPENSE", _sum: { amount: 30 }, _count: { _all: 1 } },
      { financeNature: "ACTUAL_INCOME", type: "INCOME", _sum: { amount: 45 }, _count: { _all: 1 } },
    ]);

    const s = await computeSummary({ isArchived: false });

    expect(s.budget.expense.sum).toBe(100);
    expect(s.budget.income.sum).toBe(200);
    expect(s.commitments.expense.sum).toBe(50);
    expect(s.commitments.income.sum).toBe(75);
    expect(s.actualCash.expense.sum).toBe(30);
    expect(s.actualCash.income.sum).toBe(45);
    expect(s.actualCashBalance).toBe(15);
  });

  it("financeNature=null → unclassified shelf", async () => {
    mockGroupBy([
      { financeNature: null, type: "EXPENSE", _sum: { amount: 999 }, _count: { _all: 5 } },
    ]);

    const s = await computeSummary({ isArchived: false });
    expect(s.unclassified.expense.sum).toBe(999);
    expect(s.unclassified.expense.count).toBe(5);
    expect(s.budget.expense.sum).toBe(0);
  });

  it("порожній groupBy → всі shelves нулі", async () => {
    mockGroupBy([]);
    const s = await computeSummary({ isArchived: false });
    expect(s.budget.expense.sum).toBe(0);
    expect(s.commitments.income.sum).toBe(0);
    expect(s.actualCash.expense.sum).toBe(0);
    expect(s.unclassified.income.sum).toBe(0);
    expect(s.actualCashBalance).toBe(0);
  });
});
