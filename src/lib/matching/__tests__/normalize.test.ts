import { normalizeName } from "../normalize";

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Цемент М500  ")).toBe("м500 цемент");
  });

  it("drops common Ukrainian unit suffixes", () => {
    expect(normalizeName("Цемент М500 50кг")).toBe("м500 цемент");
    expect(normalizeName("Дошка 100 шт")).toBe("дошка");
  });

  it("is order-independent (sorts tokens)", () => {
    const a = normalizeName("Цемент М500");
    const b = normalizeName("М500 цемент");
    expect(a).toBe(b);
  });

  it("drops punctuation", () => {
    expect(normalizeName("Цемент, М-500.")).toContain("цемент");
  });

  it("drops bare numeric quantities", () => {
    const out = normalizeName("Дошка 50х150 мм 6 м");
    expect(out).not.toContain("6");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeName("")).toBe("");
  });
});
