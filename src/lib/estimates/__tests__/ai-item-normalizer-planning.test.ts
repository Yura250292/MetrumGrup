import { describe, it, expect } from "@jest/globals";
import { normalizeAiItem, normalizeAiItems } from "../ai-item-normalizer";

const base = {
  description: "Робота",
  quantity: 1,
  unit: "шт",
  unitPrice: 100,
};

describe("normalizeAiItem — planning fields", () => {
  it("залишає всі поля null коли AI їх не повернув", () => {
    const r = normalizeAiItem({ ...base }, 0);
    expect(r.plannedStart).toBeNull();
    expect(r.plannedDurationDays).toBeNull();
    expect(r.predecessorSortOrder).toBeNull();
    expect(r.dependencyType).toBeNull();
    expect(r.dependencyLagDays).toBeNull();
  });

  it("парсить plannedStart з ISO-рядка", () => {
    const r = normalizeAiItem(
      { ...base, plannedStart: "2026-05-01" },
      0,
    );
    expect(r.plannedStart).toBeInstanceOf(Date);
    expect(r.plannedStart!.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("приймає plannedStart як Date instance", () => {
    const d = new Date("2026-05-15");
    const r = normalizeAiItem({ ...base, plannedStart: d }, 0);
    expect(r.plannedStart).toBe(d);
  });

  it("ігнорує невалідну дату", () => {
    const r = normalizeAiItem({ ...base, plannedStart: "not-a-date" }, 0);
    expect(r.plannedStart).toBeNull();
  });

  it("округлює plannedDurationDays до цілого", () => {
    const r = normalizeAiItem({ ...base, plannedDurationDays: "5.7" }, 0);
    expect(r.plannedDurationDays).toBe(5);
  });

  it("приймає 0 днів як валідну тривалість", () => {
    const r = normalizeAiItem({ ...base, plannedDurationDays: 0 }, 0);
    expect(r.plannedDurationDays).toBe(0);
  });

  it("випадає plannedDurationDays для відʼємних", () => {
    const r = normalizeAiItem({ ...base, plannedDurationDays: -5 }, 0);
    // -5 < 0 → не валідне → null
    expect(r.plannedDurationDays).toBeNull();
  });

  it("парсить dependencyType case-insensitive", () => {
    expect(normalizeAiItem({ ...base, dependencyType: "ss" }, 0).dependencyType).toBe("SS");
    expect(normalizeAiItem({ ...base, dependencyType: "FF" }, 0).dependencyType).toBe("FF");
    expect(normalizeAiItem({ ...base, dependencyType: "bogus" }, 0).dependencyType).toBeNull();
  });

  it("dependencyLagDays може бути відʼємним", () => {
    const r = normalizeAiItem({ ...base, dependencyLagDays: -3 }, 0);
    expect(r.dependencyLagDays).toBe(-3);
  });

  it("predecessorSortOrder — позитивний integer", () => {
    expect(normalizeAiItem({ ...base, predecessorSortOrder: 3 }, 0).predecessorSortOrder).toBe(3);
    expect(normalizeAiItem({ ...base, predecessorSortOrder: 0 }, 0).predecessorSortOrder).toBeNull();
    expect(normalizeAiItem({ ...base, predecessorSortOrder: -1 }, 0).predecessorSortOrder).toBeNull();
  });

  it("normalizeAiItems зберігає planning-поля у batch", () => {
    const out = normalizeAiItems([
      { ...base, plannedStart: "2026-06-01", plannedDurationDays: 3 },
      { ...base, predecessorSortOrder: 1, dependencyType: "SS", dependencyLagDays: 2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.plannedStart?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(out[0]!.plannedDurationDays).toBe(3);
    expect(out[1]!.predecessorSortOrder).toBe(1);
    expect(out[1]!.dependencyType).toBe("SS");
    expect(out[1]!.dependencyLagDays).toBe(2);
  });
});
