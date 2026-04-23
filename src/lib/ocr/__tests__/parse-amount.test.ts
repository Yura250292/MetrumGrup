import { parseAmount } from "../parse-amount";

describe("parseAmount", () => {
  it("parses Ukrainian format with comma decimal", () => {
    expect(parseAmount("23 121,12")).toBeCloseTo(23121.12);
    expect(parseAmount("125,50")).toBeCloseTo(125.5);
  });

  it("parses English format with dot decimal", () => {
    expect(parseAmount("23,121.12")).toBeCloseTo(23121.12);
    expect(parseAmount("125.50")).toBeCloseTo(125.5);
  });

  it("treats long-dot or long-comma groups as thousand separators", () => {
    expect(parseAmount("12.345.678")).toBe(12345678);
    expect(parseAmount("12,345,678")).toBe(12345678);
  });

  it("strips currency symbols and surrounding text", () => {
    expect(parseAmount("Сума: 1 500 грн")).toBe(1500);
    expect(parseAmount("$2,400.00")).toBeCloseTo(2400);
  });

  it("returns null for empty / non-positive inputs", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });
});
