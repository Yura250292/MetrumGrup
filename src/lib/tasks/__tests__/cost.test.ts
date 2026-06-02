import { describe, it, expect } from "@jest/globals";
import {
  computeSelfCost,
  rollupTaskCosts,
  sumGroupCost,
  type TaskCostInput,
} from "@/lib/tasks/cost";

const base = (over: Partial<TaskCostInput> & { id: string }): TaskCostInput => ({
  parentTaskId: null,
  estimatePlanned: null,
  manualPlanned: null,
  financeFact: 0,
  timeLogCost: 0,
  ...over,
});

describe("computeSelfCost", () => {
  it("план: estimate має пріоритет над manual", () => {
    expect(computeSelfCost(base({ id: "a", estimatePlanned: 100, manualPlanned: 50 })).planned).toBe(100);
  });
  it("план: manual коли немає estimate", () => {
    expect(computeSelfCost(base({ id: "a", manualPlanned: 50 })).planned).toBe(50);
  });
  it("план: 0 коли нічого немає", () => {
    expect(computeSelfCost(base({ id: "a" })).planned).toBe(0);
  });
  it("факт = finance + timelog", () => {
    expect(computeSelfCost(base({ id: "a", financeFact: 30, timeLogCost: 12 })).actual).toBe(42);
  });
});

describe("rollupTaskCosts", () => {
  it("підсумовує дітей у батька", () => {
    const inputs = [
      base({ id: "parent", estimatePlanned: 0, financeFact: 0 }),
      base({ id: "c1", parentTaskId: "parent", estimatePlanned: 200, financeFact: 50 }),
      base({ id: "c2", parentTaskId: "parent", estimatePlanned: 300, financeFact: 70 }),
    ];
    const m = rollupTaskCosts(inputs);
    expect(m.get("parent")!.plannedRollup).toBe(500);
    expect(m.get("parent")!.actualRollup).toBe(120);
    expect(m.get("parent")!.plannedSelf).toBe(0);
    expect(m.get("c1")!.plannedRollup).toBe(200);
  });

  it("рекурсія на кілька рівнів", () => {
    const inputs = [
      base({ id: "p", manualPlanned: 10 }),
      base({ id: "c", parentTaskId: "p", manualPlanned: 20 }),
      base({ id: "g", parentTaskId: "c", manualPlanned: 5 }),
    ];
    const m = rollupTaskCosts(inputs);
    expect(m.get("p")!.plannedRollup).toBe(35);
    expect(m.get("c")!.plannedRollup).toBe(25);
    expect(m.get("g")!.plannedRollup).toBe(5);
  });

  it("захист від циклу не зациклює", () => {
    const inputs = [
      base({ id: "a", parentTaskId: "b", manualPlanned: 1 }),
      base({ id: "b", parentTaskId: "a", manualPlanned: 2 }),
    ];
    const m = rollupTaskCosts(inputs);
    expect(m.has("a")).toBe(true);
    expect(m.has("b")).toBe(true);
  });

  it("self-parent не падає", () => {
    const inputs = [base({ id: "a", parentTaskId: "a", manualPlanned: 7 })];
    const m = rollupTaskCosts(inputs);
    expect(m.get("a")!.plannedRollup).toBe(7);
  });
});

describe("sumGroupCost", () => {
  it("сумує rollup по групі", () => {
    const inputs = [
      base({ id: "p1", manualPlanned: 100 }),
      base({ id: "p1c", parentTaskId: "p1", manualPlanned: 50 }),
      base({ id: "p2", manualPlanned: 200, financeFact: 20 }),
    ];
    const m = rollupTaskCosts(inputs);
    const total = sumGroupCost([m.get("p1")!, m.get("p2")!]);
    expect(total.planned).toBe(350); // 150 + 200
    expect(total.actual).toBe(20);
  });
});
