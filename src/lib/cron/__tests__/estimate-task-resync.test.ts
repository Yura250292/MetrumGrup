import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import type { EstimateToTasksResult } from "@/lib/projects/sync-estimate-to-tasks";
import { fireEstimateTaskResync } from "../estimate-task-resync";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

const ORIG_CORE = process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED;
const ORIG_AUTO = process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED;
const ORIG_SYSUSER = process.env.CRON_SYSTEM_USER_ID;

const successResult: EstimateToTasksResult = {
  estimateId: "",
  projectId: "",
  enabled: true,
  tasksCreated: 1,
  tasksUpdated: 2,
  tasksArchived: 0,
  dependenciesCreated: 1,
  dependenciesUpdated: 0,
  dependenciesRemoved: 0,
  warnings: [],
  syncedAt: new Date(0),
};

let estimateFindMany: Stub;
let userFindFirst: Stub;

beforeEach(() => {
  process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = "true";
  process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED = "true";
  delete process.env.CRON_SYSTEM_USER_ID;

  if (!(prisma as any).estimate) (prisma as any).estimate = {};
  if (!(prisma as any).user) (prisma as any).user = {};
  estimateFindMany = setStub((prisma as any).estimate, "findMany");
  userFindFirst = setStub((prisma as any).user, "findFirst");
  userFindFirst.mockResolvedValue({ id: "user-admin" } as never);
});

afterAll(() => {
  if (ORIG_CORE === undefined) delete process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED;
  else process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = ORIG_CORE;
  if (ORIG_AUTO === undefined) delete process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED;
  else process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED = ORIG_AUTO;
  if (ORIG_SYSUSER === undefined) delete process.env.CRON_SYSTEM_USER_ID;
  else process.env.CRON_SYSTEM_USER_ID = ORIG_SYSUSER;
});

describe("fireEstimateTaskResync", () => {
  it("no-op when core flag disabled", async () => {
    process.env.ESTIMATE_TO_TASKS_SYNC_ENABLED = "false";
    const sync = jest.fn(async (_e: string, _u: string) => successResult);
    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.enabled).toBe(false);
    expect(estimateFindMany).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it("no-op when auto-resync flag disabled", async () => {
    process.env.ESTIMATE_TO_TASKS_AUTO_RESYNC_ENABLED = "false";
    const sync = jest.fn(async (_e: string, _u: string) => successResult);
    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.enabled).toBe(false);
    expect(sync).not.toHaveBeenCalled();
  });

  it("returns enabled:true з порожнім списком якщо немає кошторисів", async () => {
    estimateFindMany.mockResolvedValue([] as never);
    const sync = jest.fn(async (_e: string, _u: string) => successResult);
    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.enabled).toBe(true);
    expect(r.scanned).toBe(0);
    expect(sync).not.toHaveBeenCalled();
  });

  it("викликає sync для кожного кошторису і сумує", async () => {
    estimateFindMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }] as never);
    const sync = jest.fn(async (_e: string, _u: string) => successResult);

    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.scanned).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.totalTasksCreated).toBe(2);
    expect(r.totalTasksUpdated).toBe(4);
    expect(r.totalDependenciesCreated).toBe(2);
    expect(sync).toHaveBeenNthCalledWith(1, "e1", "user-admin");
    expect(sync).toHaveBeenNthCalledWith(2, "e2", "user-admin");
  });

  it("ловить помилку одного estimate і продовжує", async () => {
    estimateFindMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }] as never);
    let n = 0;
    const sync = jest.fn(async (_e: string, _u: string) => {
      n += 1;
      if (n === 1) throw new Error("boom");
      return successResult;
    });

    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.scanned).toBe(2);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.errors[0]).toMatch(/e1.*boom/);
  });

  it("використовує CRON_SYSTEM_USER_ID якщо заданий", async () => {
    process.env.CRON_SYSTEM_USER_ID = "user-cron";
    estimateFindMany.mockResolvedValue([{ id: "e1" }] as never);
    const sync = jest.fn(async (_e: string, _u: string) => successResult);
    await fireEstimateTaskResync({ sync: sync as any });
    expect(sync).toHaveBeenCalledWith("e1", "user-cron");
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("повертає помилку якщо нема системного користувача", async () => {
    userFindFirst.mockResolvedValue(null as never);
    const sync = jest.fn(async (_e: string, _u: string) => successResult);
    const r = await fireEstimateTaskResync({ sync: sync as any });
    expect(r.enabled).toBe(true);
    expect(r.errors[0]).toMatch(/system user/);
    expect(sync).not.toHaveBeenCalled();
  });
});
