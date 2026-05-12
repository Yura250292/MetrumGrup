import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { computeCashflow, type CashflowBucket } from "../cashflow";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let groupByMock: Stub;
let findManyMock: Stub;
let aggregateMock: Stub;
let payAggregateMock: Stub;
let payFindManyMock: Stub;

beforeEach(() => {
  groupByMock = setStub((prisma as any).financeEntry, "groupBy");
  findManyMock = setStub((prisma as any).financeEntry, "findMany");
  aggregateMock = setStub((prisma as any).financeEntry, "aggregate");
  aggregateMock.mockResolvedValue({ _sum: { amount: 0 } } as never);
  (prisma as any).supplierPayment = (prisma as any).supplierPayment ?? {};
  payAggregateMock = setStub((prisma as any).supplierPayment, "aggregate");
  payAggregateMock.mockResolvedValue({ _sum: { amount: 0 } } as never);
  payFindManyMock = setStub((prisma as any).supplierPayment, "findMany");
  payFindManyMock.mockResolvedValue([] as never);
});

function sum(buckets: CashflowBucket[], path: (b: CashflowBucket) => number) {
  return buckets.reduce((acc, b) => acc + path(b), 0);
}

describe("computeCashflow — Phase 4.2 commitments + actualCash dimensions", () => {
  const from = new Date("2026-05-01T00:00:00Z");
  const to = new Date("2026-05-10T00:00:00Z");

  it("financeNature=null → тільки fact, commitments/actualCash порожні", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "FACT",
        type: "EXPENSE",
        amount: "100",
        occurredAt: new Date("2026-05-03T12:00:00Z"),
        financeNature: null,
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.fact.outgoing)).toBe(100);
    expect(sum(r.buckets, (b) => b.commitments.outgoing)).toBe(0);
    expect(sum(r.buckets, (b) => b.actualCash.outgoing)).toBe(0);
  });

  it("COMMITTED_EXPENSE → commitments.outgoing і одночасно fact.outgoing", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "FACT",
        type: "EXPENSE",
        amount: "500",
        occurredAt: new Date("2026-05-03T08:00:00Z"),
        financeNature: "COMMITTED_EXPENSE",
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.fact.outgoing)).toBe(500);
    expect(sum(r.buckets, (b) => b.commitments.outgoing)).toBe(500);
    expect(sum(r.buckets, (b) => b.actualCash.outgoing)).toBe(0);
  });

  it("ACTUAL_INCOME → actualCash.incoming", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "FACT",
        type: "INCOME",
        amount: "1200",
        occurredAt: new Date("2026-05-04T10:00:00Z"),
        financeNature: "ACTUAL_INCOME",
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.actualCash.incoming)).toBe(1200);
    expect(sum(r.buckets, (b) => b.commitments.incoming)).toBe(0);
  });

  it("openingBalanceActualCash = ACTUAL_INCOME − SupplierPayments до from", async () => {
    // groupBy (kind=FACT, type): legacy opening
    groupByMock.mockResolvedValueOnce([
      { type: "INCOME", _sum: { amount: "1000" } },
    ] as never);
    // FE.aggregate для ACTUAL_INCOME
    aggregateMock.mockResolvedValueOnce({
      _sum: { amount: "300" },
    } as never);
    // supplierPayment.aggregate
    payAggregateMock.mockResolvedValueOnce({
      _sum: { amount: "50" },
    } as never);
    findManyMock.mockResolvedValue([] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(r.openingBalance).toBe(1000);
    expect(r.openingBalanceActualCash).toBe(300 - 50);
  });

  it("SupplierPayment у вікні → actualCash.outgoing", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([] as never);
    payFindManyMock.mockResolvedValue([
      {
        amount: "777",
        occurredAt: new Date("2026-05-05T10:00:00Z"),
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.actualCash.outgoing)).toBe(777);
  });

  it("FE.ACTUAL_EXPENSE НЕ йде у actualCash.outgoing (anti-double-count)", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "FACT",
        type: "EXPENSE",
        amount: "200",
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        financeNature: "ACTUAL_EXPENSE",
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.actualCash.outgoing)).toBe(0);
    expect(sum(r.buckets, (b) => b.fact.outgoing)).toBe(200);
  });

  it("PLAN entries не потрапляють у commitments/actualCash", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "PLAN",
        type: "EXPENSE",
        amount: "777",
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        financeNature: "BUDGET_EXPENSE",
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(sum(r.buckets, (b) => b.plan.outgoing)).toBe(777);
    expect(sum(r.buckets, (b) => b.commitments.outgoing)).toBe(0);
    expect(sum(r.buckets, (b) => b.actualCash.outgoing)).toBe(0);
  });

  it("commitments + actualCash НЕ подвоюються у totals (totals — стара v1-семантика)", async () => {
    groupByMock.mockResolvedValue([] as never);
    findManyMock.mockResolvedValue([
      {
        kind: "FACT",
        type: "EXPENSE",
        amount: "500",
        occurredAt: new Date("2026-05-03T00:00:00Z"),
        financeNature: "COMMITTED_EXPENSE",
      },
      {
        kind: "FACT",
        type: "INCOME",
        amount: "1000",
        occurredAt: new Date("2026-05-04T00:00:00Z"),
        financeNature: "ACTUAL_INCOME",
      },
    ] as never);

    const r = await computeCashflow({ from, to, granularity: "DAY" });
    expect(r.totals.incoming).toBe(1000);
    expect(r.totals.outgoing).toBe(500);
    expect(r.totals.net).toBe(500);
  });
});
