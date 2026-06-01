import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import {
  computeEstimateItemProgress,
  approvedQuantitiesFor,
  recomputeWorkCompletion,
} from "../work-progress";

type Stub = jest.Mock<(...args: any[]) => any>;
function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let itemFindUnique: Stub;
let progressAggregate: Stub;
let progressGroupBy: Stub;
let stageFindFirst: Stub;
let stageUpdate: Stub;
let stageFindMany: Stub;

beforeEach(() => {
  (prisma as any).estimateItem = {};
  itemFindUnique = setStub((prisma as any).estimateItem, "findUnique");
  (prisma as any).foremanReportProgress = {};
  progressAggregate = setStub((prisma as any).foremanReportProgress, "aggregate");
  progressGroupBy = setStub((prisma as any).foremanReportProgress, "groupBy");
  (prisma as any).projectStageRecord = {};
  stageFindFirst = setStub((prisma as any).projectStageRecord, "findFirst");
  stageUpdate = setStub((prisma as any).projectStageRecord, "update");
  stageFindMany = setStub((prisma as any).projectStageRecord, "findMany");
});

describe("computeEstimateItemProgress (P9)", () => {
  it("рахує percent/remaining з approved-обʼємів", async () => {
    itemFindUnique.mockResolvedValue({ quantity: 100 } as never);
    progressAggregate.mockResolvedValue({ _sum: { quantityActual: 40 } } as never);

    const r = await computeEstimateItemProgress("ei1");
    expect(r.plannedQuantity).toBe(100);
    expect(r.approvedQuantity).toBe(40);
    expect(r.remainingQuantity).toBe(60);
    expect(r.percent).toBe(40);
    // лише APPROVED-звіти у фільтрі
    expect(progressAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ report: { status: "APPROVED" } }),
      }),
    );
  });

  it("plan=0 → percent 0, без ділення на нуль", async () => {
    itemFindUnique.mockResolvedValue({ quantity: 0 } as never);
    progressAggregate.mockResolvedValue({ _sum: { quantityActual: 0 } } as never);
    const r = await computeEstimateItemProgress("ei1");
    expect(r.percent).toBe(0);
  });
});

describe("approvedQuantitiesFor", () => {
  it("повертає Map id→approvedQty, тільки APPROVED", async () => {
    progressGroupBy.mockResolvedValue([
      { estimateItemId: "a", _sum: { quantityActual: 5 } },
      { estimateItemId: "b", _sum: { quantityActual: 0 } },
    ] as never);
    const map = await approvedQuantitiesFor(["a", "b"]);
    expect(map.get("a")).toBe(5);
    expect(map.get("b")).toBe(0);
  });

  it("порожній вхід → порожня Map без запиту", async () => {
    const map = await approvedQuantitiesFor([]);
    expect(map.size).toBe(0);
    expect(progressGroupBy).not.toHaveBeenCalled();
  });
});

describe("recomputeWorkCompletion (P11)", () => {
  it("approved < planned → нічого не завершує", async () => {
    itemFindUnique.mockResolvedValue({ quantity: 100 } as never);
    progressAggregate.mockResolvedValue({ _sum: { quantityActual: 40 } } as never);

    await recomputeWorkCompletion("ei1");
    expect(stageFindFirst).not.toHaveBeenCalled();
    expect(stageUpdate).not.toHaveBeenCalled();
  });

  it("approved ≥ planned → child stage COMPLETED + actualEndDate; parent перерахунок", async () => {
    itemFindUnique.mockResolvedValue({ quantity: 100 } as never);
    progressAggregate.mockResolvedValue({ _sum: { quantityActual: 100 } } as never);
    stageFindFirst.mockResolvedValue({
      id: "stage-child",
      status: "IN_PROGRESS",
      actualEndDate: null,
      parentStageId: "stage-parent",
    } as never);
    stageUpdate.mockResolvedValue({} as never);
    // parent recompute: один child, ще не всі completed → не оновлює parent
    stageFindMany.mockResolvedValue([
      { status: "COMPLETED", actualEndDate: new Date("2026-06-01") },
    ] as never);

    await recomputeWorkCompletion("ei1");

    expect(stageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stage-child" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    // parent теж COMPLETED (єдиний child completed)
    expect(stageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stage-parent" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("немає stage-запису → no-op", async () => {
    itemFindUnique.mockResolvedValue({ quantity: 10 } as never);
    progressAggregate.mockResolvedValue({ _sum: { quantityActual: 10 } } as never);
    stageFindFirst.mockResolvedValue(null as never);

    await recomputeWorkCompletion("ei1");
    expect(stageUpdate).not.toHaveBeenCalled();
  });
});
