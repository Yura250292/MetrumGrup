import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");
jest.mock("@/lib/audit", () => ({
  auditLog: jest.fn(async () => undefined),
}));

import { prisma } from "@/lib/prisma";
import { importExcelPlanToEstimate } from "../import-excel-plan";
import type {
  ParsedPlanItem,
  ParseProjectPlanResult,
} from "@/lib/parsers/excel-project-plan-parser";

type Stub = jest.Mock<(...args: any[]) => any>;

function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

function buildItem(over: Partial<ParsedPlanItem>): ParsedPlanItem {
  return {
    rowNumber: over.rowNumber ?? 2,
    seq: over.seq ?? "1.1",
    etap: over.etap ?? "Demolition",
    description: over.description ?? "Work",
    itemType: over.itemType ?? "labor",
    unit: over.unit ?? "м.п.",
    quantity: over.quantity ?? 10,
    unitCost: over.unitCost ?? 100,
    unitPriceCustomer: over.unitPriceCustomer ?? 120,
    plannedStart: over.plannedStart ?? null,
    plannedDurationDays: over.plannedDurationDays ?? null,
    predecessorSeq: over.predecessorSeq ?? null,
    dependencyType: over.dependencyType ?? null,
    dependencyLagDays: over.dependencyLagDays ?? 0,
  };
}

function buildParsed(items: ParsedPlanItem[]): ParseProjectPlanResult {
  return { success: true, project: null, items, errors: [], warnings: [] };
}

let projectFindUnique: Stub;
let estimateCreate: Stub;
let estimateUpdate: Stub;
let estimateFindFirst: Stub;
let itemCreate: Stub;
let itemUpdate: Stub;
let transactionMock: Stub;

beforeEach(() => {
  if (!(prisma as any).project) (prisma as any).project = {};
  if (!(prisma as any).estimate) (prisma as any).estimate = {};
  if (!(prisma as any).estimateItem) (prisma as any).estimateItem = {};
  if (!(prisma as any).auditLog) (prisma as any).auditLog = {};

  projectFindUnique = setStub((prisma as any).project, "findUnique");
  projectFindUnique.mockResolvedValue({ id: "p1", title: "Test" } as never);
  estimateCreate = setStub((prisma as any).estimate, "create");
  estimateUpdate = setStub((prisma as any).estimate, "update");
  estimateFindFirst = setStub((prisma as any).estimate, "findFirst");
  estimateFindFirst.mockResolvedValue({ number: "EST-0042" } as never);
  itemCreate = setStub((prisma as any).estimateItem, "create");
  itemUpdate = setStub((prisma as any).estimateItem, "update");
  setStub((prisma as any).auditLog, "create");

  // Кожен item.create повертає id = `id-<idx>`.
  let nextId = 1;
  itemCreate.mockImplementation(async () => ({ id: `id-${nextId++}` }) as never);
  itemUpdate.mockResolvedValue({} as never);

  transactionMock = setStub(prisma as any, "$transaction");
  transactionMock.mockImplementation(async (cb: any) => cb(prisma));
});

describe("importExcelPlanToEstimate", () => {
  it("створює Estimate + section + items за одним парсом", async () => {
    const parsed = buildParsed([
      buildItem({ seq: "1.1", etap: "Demolition" }),
      buildItem({ seq: "1.2", etap: "Demolition", description: "Work B" }),
    ]);
    estimateCreate.mockResolvedValueOnce({
      id: "est-new",
      sections: [{ id: "sec-1", title: "Demolition" }],
    } as never);

    const result = await importExcelPlanToEstimate({
      projectId: "p1",
      userId: "user-1",
      parsed,
    });

    expect(result.estimateId).toBe("est-new");
    expect(result.sectionsCreated).toBe(1);
    expect(result.itemsCreated).toBe(2);
    expect(itemCreate).toHaveBeenCalledTimes(2);
    // Estimate.create був з role=INTERNAL, status=DRAFT, нумерація = +1.
    const createCall = ((estimateCreate.mock.calls[0]?.[0] ?? {}) as any).data;
    expect(createCall.role).toBe("INTERNAL");
    expect(createCall.status).toBe("DRAFT");
    expect(createCall.number).toBe("EST-0043");
  });

  it("резолвить predecessor seq → id у другому проході", async () => {
    const parsed = buildParsed([
      buildItem({ seq: "1.1", etap: "E" }),
      buildItem({ seq: "1.2", etap: "E", predecessorSeq: "1.1" }),
    ]);
    estimateCreate.mockResolvedValueOnce({
      id: "est-x",
      sections: [{ id: "sec-1", title: "E" }],
    } as never);

    const result = await importExcelPlanToEstimate({
      projectId: "p1",
      userId: "user-1",
      parsed,
    });

    expect(result.predecessorsResolved).toBe(1);
    expect(result.predecessorsUnresolved).toBe(0);
    expect(itemUpdate).toHaveBeenCalledTimes(1);
    const updArgs = ((itemUpdate.mock.calls[0]?.[0] ?? {}) as any);
    expect(updArgs.where.id).toBe("id-2");
    expect(updArgs.data.predecessorItemId).toBe("id-1");
  });

  it("warns коли predecessor не серед imported items", async () => {
    const parsed = buildParsed([
      buildItem({ seq: "1.1", etap: "E", predecessorSeq: "999" }),
    ]);
    estimateCreate.mockResolvedValueOnce({
      id: "est-x",
      sections: [{ id: "sec-1", title: "E" }],
    } as never);

    const result = await importExcelPlanToEstimate({
      projectId: "p1",
      userId: "user-1",
      parsed,
    });
    expect(result.predecessorsResolved).toBe(0);
    expect(result.predecessorsUnresolved).toBe(1);
    expect(result.warnings.some((w) => w.includes("999"))).toBe(true);
  });

  it("одна секція на унікальний Етап (порядок зберігається)", async () => {
    const parsed = buildParsed([
      buildItem({ seq: "1.1", etap: "B" }),
      buildItem({ seq: "1.2", etap: "A" }),
      buildItem({ seq: "1.3", etap: "B" }),
    ]);
    estimateCreate.mockResolvedValueOnce({
      id: "est-y",
      sections: [
        { id: "sec-B", title: "B" },
        { id: "sec-A", title: "A" },
      ],
    } as never);

    const result = await importExcelPlanToEstimate({
      projectId: "p1",
      userId: "user-1",
      parsed,
    });
    expect(result.sectionsCreated).toBe(2);
    const createSections = ((estimateCreate.mock.calls[0]?.[0] ?? {}) as any).data
      .sections.create;
    expect(createSections.map((s: any) => s.title)).toEqual(["B", "A"]);
  });

  it("throws якщо проєкт не знайдено", async () => {
    projectFindUnique.mockResolvedValueOnce(null as never);
    await expect(
      importExcelPlanToEstimate({
        projectId: "p404",
        userId: "u",
        parsed: buildParsed([buildItem({})]),
      }),
    ).rejects.toThrow(/Проєкт не знайдено/);
  });

  it("throws якщо парсер пустий", async () => {
    await expect(
      importExcelPlanToEstimate({
        projectId: "p1",
        userId: "u",
        parsed: { success: false, project: null, items: [], errors: [], warnings: [] },
      }),
    ).rejects.toThrow(/валідних рядків/);
  });

  it("оновлює totalAmount після створення items", async () => {
    const parsed = buildParsed([
      buildItem({ seq: "1.1", etap: "E", quantity: 2, unitCost: 100 }),
      buildItem({ seq: "1.2", etap: "E", quantity: 5, unitCost: 50 }),
    ]);
    estimateCreate.mockResolvedValueOnce({
      id: "est-sum",
      sections: [{ id: "sec-1", title: "E" }],
    } as never);

    await importExcelPlanToEstimate({
      projectId: "p1",
      userId: "user-1",
      parsed,
    });
    expect(estimateUpdate).toHaveBeenCalledTimes(1);
    const updateCall = ((estimateUpdate.mock.calls[0]?.[0] ?? {}) as any);
    expect(Number(updateCall.data.totalAmount)).toBeCloseTo(450); // 200 + 250
    expect(Number(updateCall.data.finalAmount)).toBeCloseTo(450);
  });
});
