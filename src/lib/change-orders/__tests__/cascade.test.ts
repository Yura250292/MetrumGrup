import { Prisma } from "@prisma/client";
import { applyApprovedCascade, expectedFinanceType } from "../cascade";

function makeCo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "co-1",
    firmId: "metrum-group",
    projectId: "proj-1",
    number: "CO-2026-001",
    type: "ADD",
    title: "Додати розетки",
    description: "Клієнт попросив 5 розеток у санвузлі",
    requestedById: "user-pm",
    clientApprovedAt: new Date("2026-05-20T10:00:00Z"),
    adminApprovedAt: new Date("2026-05-19T10:00:00Z"),
    scheduleImpactDays: 2,
    project: { expectedEndDate: new Date("2026-06-01T00:00:00Z") },
    items: [
      {
        id: "it-1",
        costCodeId: "cc-elec",
        description: "Розетки",
        unit: "шт",
        qty: new Prisma.Decimal(5),
        unitPrice: new Prisma.Decimal(120),
        totalPrice: new Prisma.Decimal(600),
        sign: 1,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

function makeTx(co: ReturnType<typeof makeCo>) {
  return {
    changeOrder: { findUnique: jest.fn().mockResolvedValue(co) },
    financeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "fe-new" }),
    },
    project: { update: jest.fn().mockResolvedValue({}) },
  };
}

describe("applyApprovedCascade", () => {
  test("creates FinanceEntry per item with kind=PLAN source=CHANGE_ORDER", async () => {
    const co = makeCo();
    const tx = makeTx(co);
    const result = await applyApprovedCascade(
      tx as unknown as Parameters<typeof applyApprovedCascade>[0],
      co.id,
    );
    expect(result.createdFinanceEntries).toBe(1);
    expect(tx.financeEntry.create).toHaveBeenCalledTimes(1);
    const createArg = tx.financeEntry.create.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      kind: "PLAN",
      source: "CHANGE_ORDER",
      type: "EXPENSE",
      projectId: "proj-1",
      firmId: "metrum-group",
      costCodeId: "cc-elec",
      changeOrderId: "co-1",
      isDerived: true,
    });
  });

  test("REMOVE item (sign=-1) → INCOME finance entry with positive amount", async () => {
    const co = makeCo({
      items: [
        {
          id: "it-r",
          costCodeId: "cc-elec",
          description: "Прибрати дюпель",
          unit: "шт",
          qty: new Prisma.Decimal(3),
          unitPrice: new Prisma.Decimal(50),
          totalPrice: new Prisma.Decimal(-150),
          sign: -1,
          sortOrder: 0,
        },
      ],
    });
    const tx = makeTx(co);
    await applyApprovedCascade(
      tx as unknown as Parameters<typeof applyApprovedCascade>[0],
      co.id,
    );
    const arg = tx.financeEntry.create.mock.calls[0][0].data;
    expect(arg.type).toBe("INCOME");
    expect(Number(arg.amount)).toBe(150);
  });

  test("shifts Project.expectedEndDate when scheduleImpactDays != 0", async () => {
    const co = makeCo();
    const tx = makeTx(co);
    await applyApprovedCascade(
      tx as unknown as Parameters<typeof applyApprovedCascade>[0],
      co.id,
    );
    expect(tx.project.update).toHaveBeenCalledTimes(1);
    const arg = tx.project.update.mock.calls[0][0];
    expect(arg.where.id).toBe("proj-1");
    expect(arg.data.expectedEndDate.getTime()).toBeGreaterThan(
      new Date("2026-06-01").getTime(),
    );
  });

  test("does NOT shift endDate when scheduleImpactDays === 0", async () => {
    const co = makeCo({ scheduleImpactDays: 0 });
    const tx = makeTx(co);
    await applyApprovedCascade(
      tx as unknown as Parameters<typeof applyApprovedCascade>[0],
      co.id,
    );
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  test("idempotent: skips creation when finance entries already exist", async () => {
    const co = makeCo();
    const tx = makeTx(co);
    tx.financeEntry.findFirst.mockResolvedValueOnce({ id: "fe-already" });
    const result = await applyApprovedCascade(
      tx as unknown as Parameters<typeof applyApprovedCascade>[0],
      co.id,
    );
    expect(result.createdFinanceEntries).toBe(0);
    expect(tx.financeEntry.create).not.toHaveBeenCalled();
  });

  test("expectedFinanceType: sign >= 0 → EXPENSE, sign < 0 → INCOME", () => {
    expect(expectedFinanceType(1)).toBe("EXPENSE");
    expect(expectedFinanceType(0)).toBe("EXPENSE");
    expect(expectedFinanceType(-1)).toBe("INCOME");
  });
});
