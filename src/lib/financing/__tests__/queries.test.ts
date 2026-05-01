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

    expect(groupByMock).toHaveBeenCalledTimes(1);
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
    groupByMock.mockResolvedValue([
      { kind: "PLAN", type: "EXPENSE", _sum: { amount: 600000 }, _count: { _all: 1 } },
      { kind: "FACT", type: "INCOME", _sum: { amount: 34800 }, _count: { _all: 1 } },
    ] as never);

    const summary = await computeSummary({ isArchived: false });

    expect(summary.plan.expense.sum).toBe(600000);
    expect(summary.plan.income.sum).toBe(0);
    expect(summary.fact.income.sum).toBe(34800);
    expect(summary.fact.expense.sum).toBe(0);
    expect(summary.balance).toBe(34800);
    expect(summary.count).toBe(2);
  });
});
