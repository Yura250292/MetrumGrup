import { describe, it, expect } from "@jest/globals";
import {
  computeWbsCodes,
  resolveParentByCode,
  type WbsRow,
} from "@/lib/projects/wbs-numbering";

const r = (over: Partial<WbsRow> & { id: string }): WbsRow => ({
  parentStageId: null,
  sortOrder: 0,
  costType: null,
  ...over,
});

describe("computeWbsCodes", () => {
  it("нумерує корені 1, 2, 3 за sortOrder", () => {
    const m = computeWbsCodes([
      r({ id: "b", sortOrder: 1 }),
      r({ id: "a", sortOrder: 0 }),
      r({ id: "c", sortOrder: 2 }),
    ]);
    expect(m.get("a")).toBe("1");
    expect(m.get("b")).toBe("2");
    expect(m.get("c")).toBe("3");
  });

  it("вкладеність 1 / 1.1 / 1.1.1", () => {
    const m = computeWbsCodes([
      r({ id: "s1", sortOrder: 0 }),
      r({ id: "s1.1", parentStageId: "s1", sortOrder: 0 }),
      r({ id: "w1", parentStageId: "s1.1", sortOrder: 0, costType: "LABOR" }),
      r({ id: "w2", parentStageId: "s1.1", sortOrder: 1, costType: "LABOR" }),
    ]);
    expect(m.get("s1")).toBe("1");
    expect(m.get("s1.1")).toBe("1.1");
    expect(m.get("w1")).toBe("1.1.1");
    expect(m.get("w2")).toBe("1.1.2");
  });

  it("матеріали — окремий лічильник із суфіксом М", () => {
    const m = computeWbsCodes([
      r({ id: "s", sortOrder: 0 }),
      r({ id: "w1", parentStageId: "s", sortOrder: 0, costType: "LABOR" }),
      r({ id: "mat1", parentStageId: "s", sortOrder: 1, costType: "MATERIAL" }),
      r({ id: "w2", parentStageId: "s", sortOrder: 2, costType: "LABOR" }),
      r({ id: "mat2", parentStageId: "s", sortOrder: 3, costType: "MATERIAL" }),
    ]);
    expect(m.get("w1")).toBe("1.1");
    expect(m.get("w2")).toBe("1.2");
    expect(m.get("mat1")).toBe("1.М1");
    expect(m.get("mat2")).toBe("1.М2");
  });

  it("MATERIAL-вузол З дітьми = контейнер → числовий код, не М (баг-фікс)", () => {
    const m = computeWbsCodes([
      r({ id: "s1", sortOrder: 0 }),
      // помилково позначений як матеріал, але має дітей → підетап 1.1
      r({ id: "sub", parentStageId: "s1", sortOrder: 0, costType: "MATERIAL" }),
      r({ id: "w", parentStageId: "sub", sortOrder: 0, costType: "LABOR" }),
      r({ id: "mat", parentStageId: "sub", sortOrder: 1, costType: "MATERIAL" }),
    ]);
    expect(m.get("sub")).toBe("1.1"); // НЕ 1.М1
    expect(m.get("w")).toBe("1.1.1");
    expect(m.get("mat")).toBe("1.1.М1");
  });

  it("осиротілі (батько поза набором) — як корені", () => {
    const m = computeWbsCodes([r({ id: "x", parentStageId: "ghost", sortOrder: 0 })]);
    expect(m.get("x")).toBe("1");
  });

  it("цикл не зациклює і всі вузли отримують код", () => {
    const m = computeWbsCodes([
      r({ id: "a", parentStageId: "b", sortOrder: 0 }),
      r({ id: "b", parentStageId: "a", sortOrder: 0 }),
    ]);
    expect(m.size).toBe(2);
  });

  it("стабільність при однаковому sortOrder — за id", () => {
    const m = computeWbsCodes([
      r({ id: "z", sortOrder: 0 }),
      r({ id: "a", sortOrder: 0 }),
    ]);
    expect(m.get("a")).toBe("1");
    expect(m.get("z")).toBe("2");
  });
});

describe("resolveParentByCode", () => {
  // Дерево: s1=1, s11=1.1, w=1.1.1, s5=5, s52=5.2
  const codes = new Map<string, string>([
    ["s1", "1"],
    ["s11", "1.1"],
    ["w", "1.1.1"],
    ["s5", "5"],
    ["s52", "5.2"],
  ]);

  it("перенос матеріалу в інший підетап: 5.2.М1 → батько s52", () => {
    const r = resolveParentByCode("5.2.М1", "w", codes);
    expect(r).toEqual({ newParentId: "s52" });
  });

  it("код верхнього рівня → корінь (null)", () => {
    expect(resolveParentByCode("5", "w", codes)).toEqual({ newParentId: null });
  });

  it("1.1.1 → батько 1.1", () => {
    expect(resolveParentByCode("1.1.1", "x", codes)).toEqual({ newParentId: "s11" });
  });

  it("неіснуючий батько → помилка", () => {
    const r = resolveParentByCode("9.9.1", "w", codes);
    expect("error" in r).toBe(true);
  });

  it("сам собі батько → помилка", () => {
    const r = resolveParentByCode("1.1.5", "s11", codes); // батько 1.1 = s11 = сам
    expect("error" in r).toBe(true);
  });

  it("недопустимі символи → помилка", () => {
    expect("error" in resolveParentByCode("abc", "w", codes)).toBe(true);
  });
});
