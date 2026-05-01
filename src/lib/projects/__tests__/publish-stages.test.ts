import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Prisma } from "@prisma/client";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import {
  getDirtyStagesForProject,
  copyDraftToPublishedForStages,
} from "../publish-stages";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

const dec = (v: string | number | null) =>
  v === null ? null : new Prisma.Decimal(v);

let stageFindManyMock: Stub;
let executeRawMock: Stub;

beforeEach(() => {
  if (!(prisma as any).projectStageRecord) (prisma as any).projectStageRecord = {};
  stageFindManyMock = setStub((prisma as any).projectStageRecord, "findMany");
  executeRawMock = setStub(prisma as any, "$executeRaw");
});

describe("getDirtyStagesForProject", () => {
  it("повертає порожній список, коли draft === published у всіх стейджах", async () => {
    stageFindManyMock.mockResolvedValue([
      {
        id: "s1",
        planVolume: dec(10),
        factVolume: dec(5),
        planUnitPrice: dec(100),
        factUnitPrice: dec(95),
        planClientUnitPrice: dec(150),
        factClientUnitPrice: dec(140),
        publishedPlanVolume: dec(10),
        publishedFactVolume: dec(5),
        publishedPlanUnitPrice: dec(100),
        publishedFactUnitPrice: dec(95),
        publishedPlanClientUnitPrice: dec(150),
        publishedFactClientUnitPrice: dec(140),
      },
    ] as never);

    const dirty = await getDirtyStagesForProject("p1");
    expect(dirty).toEqual([]);
  });

  it("ловить розбіжність по planVolume", async () => {
    stageFindManyMock.mockResolvedValue([
      {
        id: "s1",
        planVolume: dec(20),
        factVolume: null,
        planUnitPrice: dec(100),
        factUnitPrice: null,
        planClientUnitPrice: null,
        factClientUnitPrice: null,
        publishedPlanVolume: dec(10),
        publishedFactVolume: null,
        publishedPlanUnitPrice: dec(100),
        publishedFactUnitPrice: null,
        publishedPlanClientUnitPrice: null,
        publishedFactClientUnitPrice: null,
      },
    ] as never);

    const dirty = await getDirtyStagesForProject("p1");
    expect(dirty).toEqual([{ stageId: "s1", fields: ["planVolume"] }]);
  });

  it("розрізняє null vs значення (null IS DISTINCT FROM 5 = true)", async () => {
    stageFindManyMock.mockResolvedValue([
      {
        id: "s1",
        planVolume: null,
        factVolume: null,
        planUnitPrice: dec(50),
        factUnitPrice: null,
        planClientUnitPrice: null,
        factClientUnitPrice: null,
        publishedPlanVolume: null,
        publishedFactVolume: null,
        publishedPlanUnitPrice: null,
        publishedFactUnitPrice: null,
        publishedPlanClientUnitPrice: null,
        publishedFactClientUnitPrice: null,
      },
    ] as never);

    const dirty = await getDirtyStagesForProject("p1");
    expect(dirty).toEqual([{ stageId: "s1", fields: ["planUnitPrice"] }]);
  });

  it("повертає множинні поля для одного стейджу", async () => {
    stageFindManyMock.mockResolvedValue([
      {
        id: "s1",
        planVolume: dec(11),
        factVolume: dec(6),
        planUnitPrice: dec(100),
        factUnitPrice: dec(95),
        planClientUnitPrice: dec(160),
        factClientUnitPrice: dec(140),
        publishedPlanVolume: dec(10),
        publishedFactVolume: dec(5),
        publishedPlanUnitPrice: dec(100),
        publishedFactUnitPrice: dec(95),
        publishedPlanClientUnitPrice: dec(150),
        publishedFactClientUnitPrice: dec(140),
      },
    ] as never);

    const dirty = await getDirtyStagesForProject("p1");
    expect(dirty).toHaveLength(1);
    expect(dirty[0].stageId).toBe("s1");
    expect(dirty[0].fields.sort()).toEqual(
      ["factVolume", "planClientUnitPrice", "planVolume"].sort(),
    );
  });

  it("кілька стейджів — повертає лише dirty", async () => {
    stageFindManyMock.mockResolvedValue([
      {
        id: "clean",
        planVolume: dec(10),
        factVolume: null,
        planUnitPrice: dec(100),
        factUnitPrice: null,
        planClientUnitPrice: null,
        factClientUnitPrice: null,
        publishedPlanVolume: dec(10),
        publishedFactVolume: null,
        publishedPlanUnitPrice: dec(100),
        publishedFactUnitPrice: null,
        publishedPlanClientUnitPrice: null,
        publishedFactClientUnitPrice: null,
      },
      {
        id: "dirty",
        planVolume: dec(99),
        factVolume: null,
        planUnitPrice: dec(100),
        factUnitPrice: null,
        planClientUnitPrice: null,
        factClientUnitPrice: null,
        publishedPlanVolume: dec(10),
        publishedFactVolume: null,
        publishedPlanUnitPrice: dec(100),
        publishedFactUnitPrice: null,
        publishedPlanClientUnitPrice: null,
        publishedFactClientUnitPrice: null,
      },
    ] as never);

    const dirty = await getDirtyStagesForProject("p1");
    expect(dirty.map((d) => d.stageId)).toEqual(["dirty"]);
  });
});

describe("copyDraftToPublishedForStages", () => {
  it("порожній stageIds — нічого не запитує", async () => {
    await copyDraftToPublishedForStages([]);
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it("викликає $executeRaw для непорожнього списку", async () => {
    executeRawMock.mockResolvedValue(2 as never);
    await copyDraftToPublishedForStages(["s1", "s2"]);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});
