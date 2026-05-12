import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { computeBudgetMatrix } from "../budget-matrix";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let costCodeFindManyMock: Stub;
let estimateItemGroupByMock: Stub;
let financeEntryGroupByMock: Stub;
let financeEntryFindManyMock: Stub;
let estimateCountMock: Stub;

beforeEach(() => {
  (prisma as any).costCode = (prisma as any).costCode ?? {};
  costCodeFindManyMock = setStub((prisma as any).costCode, "findMany");

  (prisma as any).estimateItem = (prisma as any).estimateItem ?? {};
  estimateItemGroupByMock = setStub(
    (prisma as any).estimateItem,
    "groupBy",
  );

  financeEntryGroupByMock = setStub(
    (prisma as any).financeEntry,
    "groupBy",
  );
  financeEntryFindManyMock = setStub(
    (prisma as any).financeEntry,
    "findMany",
  );

  (prisma as any).estimate = (prisma as any).estimate ?? {};
  estimateCountMock = setStub((prisma as any).estimate, "count");
});

describe("computeBudgetMatrix — committed column (Phase 4.3)", () => {
  it("committed = SUM(outstanding) для COMMITTED_EXPENSE per cost-code", async () => {
    costCodeFindManyMock.mockResolvedValue([
      {
        id: "cc1",
        code: "1",
        name: "Матеріали",
        parentId: null,
        defaultCostType: "MATERIAL",
      },
    ] as never);
    estimateItemGroupByMock.mockResolvedValue([
      { costCodeId: "cc1", _sum: { amount: 10_000 } },
    ] as never);
    financeEntryGroupByMock.mockResolvedValue([
      { costCodeId: "cc1", _sum: { amount: 3_000 } },
    ] as never);
    financeEntryFindManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "5000",
        costCodeId: "cc1",
        allocations: [{ amount: "1500" }], // частково оплачено
      },
      {
        id: "fe2",
        amount: "2000",
        costCodeId: "cc1",
        allocations: [], // повністю outstanding
      },
    ] as never);
    estimateCountMock.mockResolvedValue(1 as never);

    const m = await computeBudgetMatrix("proj1");
    const row = m.rows.find((r) => r.costCodeId === "cc1")!;
    expect(row.committed).toBe((5000 - 1500) + 2000);
    expect(m.totals.committed).toBe(5500);
  });

  it("повністю покритий FE (allocations >= amount) НЕ враховується у committed", async () => {
    costCodeFindManyMock.mockResolvedValue([
      {
        id: "cc1",
        code: "1",
        name: "Матеріали",
        parentId: null,
        defaultCostType: "MATERIAL",
      },
    ] as never);
    estimateItemGroupByMock.mockResolvedValue([] as never);
    financeEntryGroupByMock.mockResolvedValue([
      { costCodeId: "cc1", _sum: { amount: 1_000 } },
    ] as never);
    financeEntryFindManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        costCodeId: "cc1",
        allocations: [{ amount: "1000" }],
      },
    ] as never);
    estimateCountMock.mockResolvedValue(0 as never);

    const m = await computeBudgetMatrix("proj1");
    const row = m.rows.find((r) => r.costCodeId === "cc1")!;
    expect(row.committed).toBe(0);
  });

  it("COMMITTED без cost-code потрапляє у '(без статті)' bucket", async () => {
    costCodeFindManyMock.mockResolvedValue([] as never);
    estimateItemGroupByMock.mockResolvedValue([] as never);
    financeEntryGroupByMock.mockResolvedValue([] as never);
    financeEntryFindManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "777",
        costCodeId: null,
        allocations: [],
      },
    ] as never);
    estimateCountMock.mockResolvedValue(0 as never);

    const m = await computeBudgetMatrix("proj1");
    const unclassified = m.rows.find((r) => r.code === "__unclassified__");
    expect(unclassified?.committed).toBe(777);
  });

  it("forecast = max(revised, committed + actual)", async () => {
    costCodeFindManyMock.mockResolvedValue([
      {
        id: "cc1",
        code: "1",
        name: "Матеріали",
        parentId: null,
        defaultCostType: "MATERIAL",
      },
    ] as never);
    estimateItemGroupByMock.mockResolvedValue([
      { costCodeId: "cc1", _sum: { amount: 10_000 } },
    ] as never);
    financeEntryGroupByMock.mockResolvedValue([
      { costCodeId: "cc1", _sum: { amount: 6_000 } }, // actual
    ] as never);
    financeEntryFindManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "5000",
        costCodeId: "cc1",
        allocations: [],
      },
    ] as never);
    estimateCountMock.mockResolvedValue(1 as never);

    const m = await computeBudgetMatrix("proj1");
    const row = m.rows.find((r) => r.costCodeId === "cc1")!;
    // revised = plan = 10000, committed = 5000, actual = 6000.
    // committed + actual = 11000 > 10000 → forecast = 11000, overrun = -1000
    expect(row.committed).toBe(5000);
    expect(row.forecast).toBe(11_000);
    expect(row.variance).toBe(-1_000);
  });

  it("filter — financeNature=COMMITTED_EXPENSE + status NOT PAID", async () => {
    costCodeFindManyMock.mockResolvedValue([] as never);
    estimateItemGroupByMock.mockResolvedValue([] as never);
    financeEntryGroupByMock.mockResolvedValue([] as never);
    financeEntryFindManyMock.mockResolvedValue([] as never);
    estimateCountMock.mockResolvedValue(0 as never);

    await computeBudgetMatrix("proj1");
    const calls = financeEntryFindManyMock.mock.calls;
    const committedCall = calls.find((c: any) => {
      const w = c?.[0]?.where;
      return w?.financeNature === "COMMITTED_EXPENSE";
    });
    expect(committedCall).toBeDefined();
    const where = committedCall![0].where as any;
    expect(where).toMatchObject({
      projectId: "proj1",
      isArchived: false,
      financeNature: "COMMITTED_EXPENSE",
      status: { not: "PAID" },
    });
  });
});
