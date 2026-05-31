import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");
// SWC/next-jest на CI спотикається на class definitions усередині factory.
// EstimateVersionLockedError не використовується у тестах update flow —
// тримаємо мок мінімальним щоб уникнути hoisting-issues.
jest.mock("../version-lock", () => ({
  assertEstimateEditable: jest.fn(async () => undefined),
  EstimateVersionLockedError: Error,
}));
jest.mock("../recompute", () => ({
  recomputeEstimateTotals: jest.fn(async () => undefined),
}));

import { prisma } from "@/lib/prisma";
import { updateEstimateItem } from "../items-service";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let estimateItemFindUnique: Stub;
let estimateItemUpdate: Stub;
let criticalChangeCreate: Stub;

const existingItemRow = {
  id: "i-target",
  estimateId: "est-1",
  sectionId: "sec-1",
  description: "Робота 1",
  unit: "м.п.",
  quantity: "10",
  unitPrice: "100",
  unitCost: null,
  unitPriceCustomer: null,
  foremanId: null,
  executorText: null,
  costCodeId: null,
  costType: null,
  itemType: "labor",
  parentItemId: null,
};

const updatedRow = {
  ...existingItemRow,
  amount: "1000",
  sortOrder: 0,
  costCode: null,
  plannedStart: null,
  plannedDurationDays: null,
  plannedEnd: null,
  predecessorItemId: null,
  dependencyType: null,
  dependencyLagDays: 0,
};

beforeEach(() => {
  if (!(prisma as any).estimateItem) (prisma as any).estimateItem = {};
  if (!(prisma as any).estimateCriticalChange)
    (prisma as any).estimateCriticalChange = {};

  estimateItemFindUnique = setStub((prisma as any).estimateItem, "findUnique");
  estimateItemUpdate = setStub((prisma as any).estimateItem, "update");
  estimateItemUpdate.mockResolvedValue(updatedRow as never);
  criticalChangeCreate = setStub((prisma as any).estimateCriticalChange, "create");
  criticalChangeCreate.mockResolvedValue({} as never);

  // updateMany / deleteMany used in itemType-change cleanup path — stub to no-op.
  setStub((prisma as any).estimateItem, "updateMany").mockResolvedValue({
    count: 0,
  } as never);
});

describe("updateEstimateItem — planning validation", () => {
  it("throws when predecessorItemId points to the same row", async () => {
    estimateItemFindUnique.mockResolvedValueOnce(existingItemRow as never);

    await expect(
      updateEstimateItem({
        itemId: "i-target",
        patch: { predecessorItemId: "i-target" },
        userId: "user-1",
      }),
    ).rejects.toThrow(/не може посилатись на саму позицію/);
    expect(estimateItemUpdate).not.toHaveBeenCalled();
  });

  it("throws when predecessor lives in a different estimate", async () => {
    estimateItemFindUnique
      .mockResolvedValueOnce(existingItemRow as never)
      .mockResolvedValueOnce({ estimateId: "other-est" } as never);

    await expect(
      updateEstimateItem({
        itemId: "i-target",
        patch: { predecessorItemId: "i-other-estimate" },
        userId: "user-1",
      }),
    ).rejects.toThrow(/у тому ж кошторисі/);
    expect(estimateItemUpdate).not.toHaveBeenCalled();
  });

  it("accepts a valid predecessor from the same estimate", async () => {
    estimateItemFindUnique
      .mockResolvedValueOnce(existingItemRow as never)
      .mockResolvedValueOnce({ estimateId: "est-1" } as never);

    const dto = await updateEstimateItem({
      itemId: "i-target",
      patch: {
        predecessorItemId: "i-predecessor",
        dependencyType: "SS",
        dependencyLagDays: 3,
      },
      userId: "user-1",
    });

    expect(estimateItemUpdate).toHaveBeenCalledTimes(1);
    const updateData = ((estimateItemUpdate.mock.calls[0]?.[0] ?? {}) as any).data;
    expect(updateData.predecessorItemId).toBe("i-predecessor");
    expect(updateData.dependencyType).toBe("SS");
    expect(updateData.dependencyLagDays).toBe(3);
    expect(dto.id).toBe("i-target");
  });

  it("accepts plannedStart + plannedDurationDays without predecessor", async () => {
    estimateItemFindUnique.mockResolvedValueOnce(existingItemRow as never);

    await updateEstimateItem({
      itemId: "i-target",
      patch: {
        plannedStart: new Date("2026-05-01"),
        plannedDurationDays: 7,
      },
      userId: "user-1",
    });

    const updateData = ((estimateItemUpdate.mock.calls[0]?.[0] ?? {}) as any).data;
    expect(updateData.plannedStart).toEqual(new Date("2026-05-01"));
    expect(updateData.plannedDurationDays).toBe(7);
  });

  it("clears predecessor when explicit null is sent", async () => {
    estimateItemFindUnique.mockResolvedValueOnce(existingItemRow as never);

    await updateEstimateItem({
      itemId: "i-target",
      patch: { predecessorItemId: null },
      userId: "user-1",
    });

    const updateData = ((estimateItemUpdate.mock.calls[0]?.[0] ?? {}) as any).data;
    expect(updateData.predecessorItemId).toBe(null);
    // null skips the cross-estimate lookup
    expect(estimateItemFindUnique).toHaveBeenCalledTimes(1);
  });
});
