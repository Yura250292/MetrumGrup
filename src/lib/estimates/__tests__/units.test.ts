import { describe, it, expect } from "@jest/globals";
import { ALLOWED_UNITS, isAllowedUnit, normalizeUnit } from "../units";

describe("estimate units (P2)", () => {
  it("ALLOWED_UNITS містить канонічний набір", () => {
    expect(ALLOWED_UNITS).toEqual(["м²", "м³", "пог.м", "шт", "компл"]);
  });

  it("isAllowedUnit: true лише для дозволених", () => {
    expect(isAllowedUnit("м²")).toBe(true);
    expect(isAllowedUnit("шт")).toBe(true);
    expect(isAllowedUnit("кг")).toBe(false);
    expect(isAllowedUnit(null)).toBe(false);
    expect(isAllowedUnit(undefined)).toBe(false);
    expect(isAllowedUnit("")).toBe(false);
  });

  it("normalizeUnit: синоніми → канон", () => {
    expect(normalizeUnit("м2")).toBe("м²");
    expect(normalizeUnit("кв.м")).toBe("м²");
    expect(normalizeUnit("м3")).toBe("м³");
    expect(normalizeUnit("пм")).toBe("пог.м");
    expect(normalizeUnit("шт.")).toBe("шт");
    expect(normalizeUnit("к-т")).toBe("компл");
  });

  it("normalizeUnit: дозволені лишаються без змін", () => {
    expect(normalizeUnit("пог.м")).toBe("пог.м");
    expect(normalizeUnit("компл")).toBe("компл");
  });

  it("normalizeUnit: невпізнане повертає trimmed-оригінал", () => {
    expect(normalizeUnit("  тонна  ")).toBe("тонна");
    expect(normalizeUnit("")).toBe("");
  });
});
