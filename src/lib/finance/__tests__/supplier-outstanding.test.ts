import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { computeSupplierOutstanding } from "../supplier-allocation";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let findManyMock: Stub;
let groupByMock: Stub;

beforeEach(() => {
  findManyMock = setStub((prisma as any).financeEntry, "findMany");
  (prisma as any).supplierPaymentAllocation =
    (prisma as any).supplierPaymentAllocation ?? {};
  groupByMock = setStub(
    (prisma as any).supplierPaymentAllocation,
    "groupBy",
  );
});

describe("computeSupplierOutstanding", () => {
  it("порожня вибірка → порожня мапа, без запиту на allocations", async () => {
    findManyMock.mockResolvedValue([] as never);
    const result = await computeSupplierOutstanding({ firmId: "metrum-group" });
    expect(result.size).toBe(0);
    expect(groupByMock).not.toHaveBeenCalled();
  });

  it("FE без allocations: outstanding = amount, count=1, oldestUnpaidAt = occurredAt", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([] as never);

    const result = await computeSupplierOutstanding({ firmId: null });
    expect(result.get("cp1")).toEqual({
      counterpartyId: "cp1",
      outstanding: 1000,
      unpaidEntriesCount: 1,
      oldestUnpaidAt: new Date("2026-04-01T00:00:00Z"),
    });
  });

  it("часткова allocation: outstanding = amount − paid", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        occurredAt: new Date("2026-04-01"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([
      { financeEntryId: "fe1", _sum: { amount: "400" } },
    ] as never);

    const result = await computeSupplierOutstanding({ firmId: "metrum-group" });
    expect(result.get("cp1")?.outstanding).toBe(600);
  });

  it("повністю покрита allocation → контрагент НЕ потрапляє у мапу", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        occurredAt: new Date("2026-04-01"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([
      { financeEntryId: "fe1", _sum: { amount: "1000" } },
    ] as never);

    const result = await computeSupplierOutstanding({ firmId: null });
    expect(result.size).toBe(0);
  });

  it("over-allocation (paid > amount) → outstanding ≤ 0, FE виключено", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        occurredAt: new Date("2026-04-01"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([
      { financeEntryId: "fe1", _sum: { amount: "1200" } },
    ] as never);

    const result = await computeSupplierOutstanding({ firmId: null });
    expect(result.size).toBe(0);
  });

  it("кілька FE на одного контрагента: сума outstanding, count=N, oldest=min(occurredAt)", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1000",
        occurredAt: new Date("2026-04-10"),
        counterpartyId: "cp1",
      },
      {
        id: "fe2",
        amount: "500",
        occurredAt: new Date("2026-03-01"),
        counterpartyId: "cp1",
      },
      {
        id: "fe3",
        amount: "200",
        occurredAt: new Date("2026-04-05"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([
      { financeEntryId: "fe2", _sum: { amount: "100" } }, // partial
    ] as never);

    const row = (
      await computeSupplierOutstanding({ firmId: "metrum-group" })
    ).get("cp1");
    expect(row?.outstanding).toBe(1000 + 400 + 200);
    expect(row?.unpaidEntriesCount).toBe(3);
    expect(row?.oldestUnpaidAt).toEqual(new Date("2026-03-01"));
  });

  it("Decimal у amount/_sum.amount обробляється коректно (string→Number)", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "fe1",
        amount: "1234.56",
        occurredAt: new Date("2026-04-01"),
        counterpartyId: "cp1",
      },
    ] as never);
    groupByMock.mockResolvedValue([
      { financeEntryId: "fe1", _sum: { amount: "234.56" } },
    ] as never);

    const result = await computeSupplierOutstanding({ firmId: null });
    expect(result.get("cp1")?.outstanding).toBeCloseTo(1000, 2);
  });

  it("where бере APPROVED|PENDING, кешує firmId, виключає DRAFT/PAID/archived", async () => {
    findManyMock.mockResolvedValue([] as never);
    await computeSupplierOutstanding({ firmId: "metrum-studio" });
    const arg = findManyMock.mock.calls[0][0] as { where: any };
    expect(arg.where).toMatchObject({
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      status: { in: ["APPROVED", "PENDING"] },
      counterpartyId: { not: null },
      firmId: "metrum-studio",
    });
  });

  it("firmId=null → без firm-обмеження (cross-firm)", async () => {
    findManyMock.mockResolvedValue([] as never);
    await computeSupplierOutstanding({ firmId: null });
    const arg = findManyMock.mock.calls[0][0] as { where: any };
    expect(arg.where.firmId).toBeUndefined();
  });

  it("default — includeLegacyNullNature=true: OR з COMMITTED_EXPENSE і null", async () => {
    findManyMock.mockResolvedValue([] as never);
    await computeSupplierOutstanding({ firmId: null });
    const arg = findManyMock.mock.calls[0][0] as { where: any };
    expect(arg.where.OR).toEqual([
      { financeNature: "COMMITTED_EXPENSE" },
      { financeNature: null },
    ]);
  });

  it("includeLegacyNullNature=false: тільки COMMITTED_EXPENSE", async () => {
    findManyMock.mockResolvedValue([] as never);
    await computeSupplierOutstanding({
      firmId: null,
      includeLegacyNullNature: false,
    });
    const arg = findManyMock.mock.calls[0][0] as { where: any };
    expect(arg.where.financeNature).toBe("COMMITTED_EXPENSE");
    expect(arg.where.OR).toBeUndefined();
  });
});
