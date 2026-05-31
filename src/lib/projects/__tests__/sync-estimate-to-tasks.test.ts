import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";

jest.mock("@/lib/prisma");
jest.mock("@/lib/audit", () => ({
  auditLog: jest.fn(async () => undefined),
}));

import { prisma } from "@/lib/prisma";
import { syncEstimateItemsToTasks } from "../sync-estimate-to-tasks";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

const originalFlag = process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED;

let estimateFindUnique: Stub;
let stageFindMany: Stub;
let taskFindMany: Stub;
let taskCreate: Stub;
let taskUpdate: Stub;
let taskStatusFindFirst: Stub;
let depFindMany: Stub;
let depCreate: Stub;
let transactionMock: Stub;

function buildItem(overrides: Partial<any>): any {
  return {
    id: overrides.id ?? "i1",
    description: overrides.description ?? "Робота",
    itemType: overrides.itemType ?? null,
    plannedStart: overrides.plannedStart ?? null,
    plannedDurationDays: overrides.plannedDurationDays ?? null,
    plannedEnd: overrides.plannedEnd ?? null,
    predecessorItemId: overrides.predecessorItemId ?? null,
    dependencyType: overrides.dependencyType ?? null,
    dependencyLagDays: overrides.dependencyLagDays ?? 0,
    sortOrder: 0,
  };
}

beforeEach(() => {
  process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = "true";

  if (!(prisma as any).estimate) (prisma as any).estimate = {};
  if (!(prisma as any).projectStageRecord) (prisma as any).projectStageRecord = {};
  if (!(prisma as any).task) (prisma as any).task = {};
  if (!(prisma as any).taskDependency) (prisma as any).taskDependency = {};
  if (!(prisma as any).taskStatus) (prisma as any).taskStatus = {};
  if (!(prisma as any).taskLabel) (prisma as any).taskLabel = {};
  if (!(prisma as any).auditLog) (prisma as any).auditLog = {};
  setStub((prisma as any).auditLog, "create");

  estimateFindUnique = setStub((prisma as any).estimate, "findUnique");
  stageFindMany = setStub((prisma as any).projectStageRecord, "findMany");
  taskFindMany = setStub((prisma as any).task, "findMany");
  taskCreate = setStub((prisma as any).task, "create");
  taskUpdate = setStub((prisma as any).task, "update");
  taskStatusFindFirst = setStub((prisma as any).taskStatus, "findFirst");
  taskStatusFindFirst.mockResolvedValue({ id: "status-new", isDefault: true } as never);
  setStub((prisma as any).taskStatus, "createMany");
  setStub((prisma as any).taskLabel, "createMany");
  depFindMany = setStub((prisma as any).taskDependency, "findMany");
  depCreate = setStub((prisma as any).taskDependency, "create");
  setStub((prisma as any).taskDependency, "update");
  setStub((prisma as any).taskDependency, "delete");

  transactionMock = setStub(prisma as any, "$transaction");
  transactionMock.mockImplementation(async (cb: any) => cb(prisma));
});

afterAll(() => {
  if (originalFlag === undefined) {
    delete process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED;
  } else {
    process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = originalFlag;
  }
});

describe("syncEstimateItemsToTasks", () => {
  it("no-op when feature flag is disabled", async () => {
    process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = "false";
    const result = await syncEstimateItemsToTasks("est-1", "user-1");
    expect(result.enabled).toBe(false);
    expect(result.tasksCreated).toBe(0);
    expect(estimateFindUnique).not.toHaveBeenCalled();
  });

  it("creates Task for labor item, skips material item", async () => {
    estimateFindUnique.mockResolvedValue({
      id: "est-1",
      projectId: "p1",
      sections: [
        {
          id: "sec-1",
          items: [
            buildItem({ id: "i-labor", itemType: "labor", description: "Демонтаж" }),
            buildItem({ id: "i-mat", itemType: "material", description: "Бетон" }),
          ],
        },
      ],
      items: [],
    } as never);
    stageFindMany.mockResolvedValue([
      { id: "stage-labor", sourceEstimateItemId: "i-labor" },
    ] as never);
    taskFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: "t-labor", sourceEstimateItemId: "i-labor" },
      ] as never);
    depFindMany.mockResolvedValue([] as never);

    const result = await syncEstimateItemsToTasks("est-1", "user-1");

    expect(result.enabled).toBe(true);
    expect(result.tasksCreated).toBe(1);
    expect(taskCreate).toHaveBeenCalledTimes(1);
    const createCall = (taskCreate.mock.calls[0]?.[0] ?? {}) as any;
    expect(createCall.data.sourceEstimateItemId).toBe("i-labor");
    expect(createCall.data.stageId).toBe("stage-labor");
    expect(createCall.data.statusId).toBe("status-new");
  });

  it("creates TaskDependency between two labor items with SS+2", async () => {
    estimateFindUnique.mockResolvedValue({
      id: "est-1",
      projectId: "p1",
      sections: [],
      items: [
        buildItem({ id: "i-a", itemType: "labor" }),
        buildItem({
          id: "i-b",
          itemType: "labor",
          predecessorItemId: "i-a",
          dependencyType: "SS",
          dependencyLagDays: 2,
        }),
      ],
    } as never);
    stageFindMany.mockResolvedValue([
      { id: "stage-a", sourceEstimateItemId: "i-a" },
      { id: "stage-b", sourceEstimateItemId: "i-b" },
    ] as never);
    taskFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: "t-a", sourceEstimateItemId: "i-a" },
        { id: "t-b", sourceEstimateItemId: "i-b" },
      ] as never);
    depFindMany.mockResolvedValue([] as never);

    const result = await syncEstimateItemsToTasks("est-1", "user-1");

    expect(result.dependenciesCreated).toBe(1);
    expect(depCreate).toHaveBeenCalledTimes(1);
    const depData = ((depCreate.mock.calls[0]?.[0] ?? {}) as any).data;
    expect(depData).toMatchObject({
      predecessorId: "t-a",
      successorId: "t-b",
      type: "SS",
      lagDays: 2,
    });
  });

  it("detects cycle and throws before any DB write", async () => {
    estimateFindUnique.mockResolvedValue({
      id: "est-1",
      projectId: "p1",
      sections: [],
      items: [
        buildItem({ id: "i-a", itemType: "labor", predecessorItemId: "i-b" }),
        buildItem({ id: "i-b", itemType: "labor", predecessorItemId: "i-a" }),
      ],
    } as never);
    stageFindMany.mockResolvedValue([] as never);

    await expect(syncEstimateItemsToTasks("est-1", "user-1")).rejects.toThrow(
      /Cycle detected/,
    );
    expect(taskCreate).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("warns and skips dependency when predecessor is a material item", async () => {
    estimateFindUnique.mockResolvedValue({
      id: "est-1",
      projectId: "p1",
      sections: [],
      items: [
        buildItem({ id: "i-mat", itemType: "material" }),
        buildItem({
          id: "i-labor",
          itemType: "labor",
          predecessorItemId: "i-mat",
        }),
      ],
    } as never);
    stageFindMany.mockResolvedValue([
      { id: "stage-labor", sourceEstimateItemId: "i-labor" },
    ] as never);
    taskFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: "t-labor", sourceEstimateItemId: "i-labor" },
      ] as never);
    depFindMany.mockResolvedValue([] as never);

    const result = await syncEstimateItemsToTasks("est-1", "user-1");

    expect(result.dependenciesCreated).toBe(0);
    expect(result.warnings.some((w) => w.includes("not a task"))).toBe(true);
    expect(depCreate).not.toHaveBeenCalled();
  });

  it("preserves dates when baseline is frozen", async () => {
    const frozen = new Date("2026-05-01T00:00:00Z");
    estimateFindUnique.mockResolvedValue({
      id: "est-1",
      projectId: "p1",
      sections: [],
      items: [
        buildItem({
          id: "i-a",
          itemType: "labor",
          plannedStart: new Date("2026-06-01"),
          plannedDurationDays: 5,
        }),
      ],
    } as never);
    stageFindMany.mockResolvedValue([
      { id: "stage-a", sourceEstimateItemId: "i-a" },
    ] as never);
    taskFindMany
      .mockResolvedValueOnce([
        {
          id: "t-a",
          sourceEstimateItemId: "i-a",
          statusId: "status-active",
          plannedStartAt: new Date("2026-04-01"),
          plannedEndAt: new Date("2026-04-10"),
          baselineFrozenAt: frozen,
          isArchived: false,
          stageId: "stage-a",
          title: "Old title",
        },
      ] as never)
      .mockResolvedValueOnce([
        { id: "t-a", sourceEstimateItemId: "i-a" },
      ] as never);
    depFindMany.mockResolvedValue([] as never);

    const result = await syncEstimateItemsToTasks("est-1", "user-1");

    expect(result.tasksUpdated).toBe(1);
    const updateCall = (taskUpdate.mock.calls[0]?.[0] ?? {}) as any;
    expect(updateCall.data.plannedStartAt).toBeUndefined();
    expect(updateCall.data.plannedEndAt).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("baseline frozen"))).toBe(true);
  });
});
