import { describe, it, expect } from "@jest/globals";
import { scheduleStages, type ScheduleRow } from "@/lib/projects/stage-schedule";

const row = (over: Partial<ScheduleRow> & { id: string }): ScheduleRow => ({
  startDate: null,
  endDate: null,
  plannedDurationDays: null,
  predecessorStageId: null,
  dependencyType: null,
  dependencyLagDays: 0,
  ...over,
});

describe("scheduleStages", () => {
  it("якір: тривалість 3 від 01.05 → кінець 03.05 (включно)", () => {
    const m = scheduleStages([row({ id: "a", startDate: "2026-05-01", plannedDurationDays: 3 })]);
    expect(m.get("a")).toEqual({ start: "2026-05-01", end: "2026-05-03" });
  });

  it("SS lag 0: початок = початок попередника", () => {
    const m = scheduleStages([
      row({ id: "a", startDate: "2026-05-01", plannedDurationDays: 3 }),
      row({ id: "b", predecessorStageId: "a", dependencyType: "SS", plannedDurationDays: 7 }),
    ]);
    expect(m.get("b")).toEqual({ start: "2026-05-01", end: "2026-05-07" });
  });

  it("FS: початок = кінець попередника + 1", () => {
    const m = scheduleStages([
      row({ id: "p", startDate: "2026-05-08", plannedDurationDays: 1 }), // end 08.05
      row({ id: "s", predecessorStageId: "p", dependencyType: "FS", plannedDurationDays: 3 }),
    ]);
    expect(m.get("p")!.end).toBe("2026-05-08");
    expect(m.get("s")).toEqual({ start: "2026-05-09", end: "2026-05-11" });
  });

  it("FS lag 2: зміщення додається", () => {
    const m = scheduleStages([
      row({ id: "p", startDate: "2026-05-01", plannedDurationDays: 1 }),
      row({ id: "s", predecessorStageId: "p", dependencyType: "FS", dependencyLagDays: 2, plannedDurationDays: 1 }),
    ]);
    // pred end 01.05; FS+1+2 = 04.05
    expect(m.get("s")!.start).toBe("2026-05-04");
  });

  it("матеріал тривалість 0 під попередником FS → start=end", () => {
    const m = scheduleStages([
      row({ id: "p", startDate: "2026-05-07", plannedDurationDays: 7 }), // end 13.05
      row({ id: "mat", predecessorStageId: "p", dependencyType: "FS", plannedDurationDays: 0 }),
    ]);
    expect(m.get("mat")).toEqual({ start: "2026-05-14", end: "2026-05-14" });
  });

  it("FF: кінець вирівнюється з кінцем попередника", () => {
    const m = scheduleStages([
      row({ id: "p", startDate: "2026-05-01", plannedDurationDays: 10 }), // end 10.05
      row({ id: "s", predecessorStageId: "p", dependencyType: "FF", plannedDurationDays: 3 }),
    ]);
    // end = 10.05, start = 10.05 - 2 = 08.05
    expect(m.get("s")).toEqual({ start: "2026-05-08", end: "2026-05-10" });
  });

  it("ланцюг із 3 ланок (FS→FS)", () => {
    const m = scheduleStages([
      row({ id: "a", startDate: "2026-05-01", plannedDurationDays: 2 }), // 01-02
      row({ id: "b", predecessorStageId: "a", dependencyType: "FS", plannedDurationDays: 2 }), // 03-04
      row({ id: "c", predecessorStageId: "b", dependencyType: "FS", plannedDurationDays: 1 }), // 05
    ]);
    expect(m.get("c")).toEqual({ start: "2026-05-05", end: "2026-05-05" });
  });

  it("цикл не зациклює", () => {
    const m = scheduleStages([
      row({ id: "a", predecessorStageId: "b", dependencyType: "FS", plannedDurationDays: 1 }),
      row({ id: "b", predecessorStageId: "a", dependencyType: "FS", plannedDurationDays: 1 }),
    ]);
    expect(m.size).toBe(2);
  });

  it("без тривалості — зберігає ручні дати", () => {
    const m = scheduleStages([row({ id: "a", startDate: "2026-05-01", endDate: "2026-05-09" })]);
    expect(m.get("a")).toEqual({ start: "2026-05-01", end: "2026-05-09" });
  });
});
