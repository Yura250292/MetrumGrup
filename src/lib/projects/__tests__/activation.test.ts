import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import {
  checkProjectActivationReadiness,
  checkProjectCompletionReadiness,
  isReportableItemType,
} from "../activation";

type Stub = jest.Mock<(...args: any[]) => any>;
function setStub(target: any, key: string): Stub {
  const fn = jest.fn() as unknown as Stub;
  target[key] = fn;
  return fn;
}

let estimateFindMany: Stub;
let stageFindMany: Stub;
// getEffectiveForemanId (real) бʼє у ці два методи; керуємо ним через них.
let itemFindUnique: Stub;
let stageFindFirst: Stub;

beforeEach(() => {
  (prisma as any).estimate = {};
  estimateFindMany = setStub((prisma as any).estimate, "findMany");
  (prisma as any).projectStageRecord = {};
  stageFindMany = setStub((prisma as any).projectStageRecord, "findMany");
  stageFindFirst = setStub((prisma as any).projectStageRecord, "findFirst");
  (prisma as any).estimateItem = {};
  itemFindUnique = setStub((prisma as any).estimateItem, "findUnique");
});

describe("isReportableItemType", () => {
  it("матеріал не reportable; решта (вкл. null) — reportable", () => {
    expect(isReportableItemType("material")).toBe(false);
    expect(isReportableItemType("labor")).toBe(true);
    expect(isReportableItemType(null)).toBe(true);
  });
});

describe("checkProjectActivationReadiness (P1/P4)", () => {
  it("немає кошторису → not ok", async () => {
    estimateFindMany.mockResolvedValue([] as never);
    const r = await checkProjectActivationReadiness("p1");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("Немає кошторису");
  });

  it("заморожений кошторис + робота з foreman → ok", async () => {
    estimateFindMany.mockResolvedValue([
      {
        id: "e1",
        versions: [{ isLocked: true }],
        sections: [{ id: "s1" }],
        items: [
          { id: "i1", description: "Стяжка", itemType: "labor", isReportable: true },
          { id: "m1", description: "Цемент", itemType: "material", isReportable: true },
        ],
      },
    ] as never);
    // effective foreman: явний foremanId на позиції
    itemFindUnique.mockResolvedValue({ foremanId: "user-1", sectionId: null } as never);

    const r = await checkProjectActivationReadiness("p1");
    expect(r.ok).toBe(true);
    expect(r.checks.hasLockedVersion).toBe(true);
    // материал не перевіряється на foreman — лише i1
    expect(itemFindUnique).toHaveBeenCalledTimes(1);
  });

  it("робота без effective foreman → not ok + missingForemanItems", async () => {
    estimateFindMany.mockResolvedValue([
      {
        id: "e1",
        versions: [{ isLocked: true }],
        sections: [{ id: "s1" }],
        items: [{ id: "i1", description: "Стяжка", itemType: "labor", isReportable: true }],
      },
    ] as never);
    // ні foremanId, ні sectionId → null
    itemFindUnique.mockResolvedValue({ foremanId: null, sectionId: null } as never);

    const r = await checkProjectActivationReadiness("p1");
    expect(r.ok).toBe(false);
    expect(r.checks.allWorkHaveForeman).toBe(false);
    expect(r.missingForemanItems).toEqual([{ id: "i1", description: "Стяжка" }]);
  });

  it("foreman через відповідального розділу (fallback stage)", async () => {
    estimateFindMany.mockResolvedValue([
      {
        id: "e1",
        versions: [{ isLocked: true }],
        sections: [{ id: "s1" }],
        items: [{ id: "i1", description: "X", itemType: "labor", isReportable: true }],
      },
    ] as never);
    itemFindUnique.mockResolvedValue({ foremanId: null, sectionId: "s1" } as never);
    stageFindFirst.mockResolvedValue({ responsibleUserId: "user-2" } as never);

    const r = await checkProjectActivationReadiness("p1");
    expect(r.ok).toBe(true);
  });

  it("не заморожений кошторис → not ok", async () => {
    estimateFindMany.mockResolvedValue([
      {
        id: "e1",
        versions: [{ isLocked: false }],
        sections: [{ id: "s1" }],
        items: [{ id: "i1", description: "X", itemType: "labor", isReportable: true }],
      },
    ] as never);
    itemFindUnique.mockResolvedValue({ foremanId: "u", sectionId: null } as never);
    const r = await checkProjectActivationReadiness("p1");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("Кошторис не заморожено");
  });

  it("isReportable=false (REMOVE через ДКО) виключається з робіт", async () => {
    estimateFindMany.mockResolvedValue([
      {
        id: "e1",
        versions: [{ isLocked: true }],
        sections: [{ id: "s1" }],
        items: [{ id: "i1", description: "Знято", itemType: "labor", isReportable: false }],
      },
    ] as never);
    const r = await checkProjectActivationReadiness("p1");
    expect(r.checks.hasWork).toBe(false);
    expect(itemFindUnique).not.toHaveBeenCalled();
  });
});

describe("checkProjectCompletionReadiness (P11)", () => {
  it("усі розділи COMPLETED → ok", async () => {
    stageFindMany.mockResolvedValue([
      { id: "s1", status: "COMPLETED", customName: "Розділ 1", stage: null },
    ] as never);
    const r = await checkProjectCompletionReadiness("p1");
    expect(r.ok).toBe(true);
  });

  it("є незавершений розділ → not ok", async () => {
    stageFindMany.mockResolvedValue([
      { id: "s1", status: "COMPLETED", customName: "A", stage: null },
      { id: "s2", status: "IN_PROGRESS", customName: "B", stage: null },
    ] as never);
    const r = await checkProjectCompletionReadiness("p1");
    expect(r.ok).toBe(false);
    expect(r.incompleteSections).toEqual([{ id: "s2", name: "B" }]);
  });

  it("порожній проєкт (без розділів) → not ok", async () => {
    stageFindMany.mockResolvedValue([] as never);
    const r = await checkProjectCompletionReadiness("p1");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("Немає жодного розділу");
  });
});
