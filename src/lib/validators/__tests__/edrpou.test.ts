import { describe, it, expect } from "@jest/globals";
import {
  isValidEdrpou,
  isValidRnokpp,
  isValidTaxId,
  normalizeTaxId,
} from "../edrpou";

/**
 * ЄДРПОУ і РНОКПП валідовано вручну за алгоритмом ДСТУ 4163-2003. Деякі
 * значення збігаються з реальними юридичними особами (Приватбанк, Укрпошта,
 * Укрзалізниця тощо) — там, де контрольна сума справді сходиться. Інші —
 * синтетичні з перевіреною checksum.
 */
describe("edrpou validator", () => {
  describe("normalizeTaxId", () => {
    it("strips spaces, dashes, underscores", () => {
      expect(normalizeTaxId("12 345 678")).toBe("12345678");
      expect(normalizeTaxId("12-345-678")).toBe("12345678");
      expect(normalizeTaxId("12_345_678")).toBe("12345678");
      expect(normalizeTaxId(" 12345678 ")).toBe("12345678");
    });
    it("handles null/undefined/empty", () => {
      expect(normalizeTaxId(null)).toBe("");
      expect(normalizeTaxId(undefined)).toBe("");
      expect(normalizeTaxId("")).toBe("");
    });
  });

  describe("isValidEdrpou", () => {
    it.each([
      ["14360570"], // Приватбанк
      ["00032112"], // Укрпошта (leading zeros)
      ["00131305"], // Укрзалізниця
      ["33152423"],
      ["21560766"], // Нова Пошта
      ["43395032"],
      ["32474834"],
      ["22934105"],
      ["41624793"],
      ["26426802"],
      ["12345678"], // synthetic checksum-valid
      ["99999994"], // synthetic, requires fallback weights
    ])("accepts valid EDRPOU %s", (edrpou) => {
      expect(isValidEdrpou(edrpou)).toBe(true);
    });

    it.each([
      ["12345679"], // wrong last digit
      ["11111111"], // wrong checksum
      ["99999999"], // would need to be 99999994
      ["14360571"], // off-by-one
      ["00032113"],
    ])("rejects invalid EDRPOU %s", (edrpou) => {
      expect(isValidEdrpou(edrpou)).toBe(false);
    });

    it("rejects wrong length", () => {
      expect(isValidEdrpou("1234567")).toBe(false);
      expect(isValidEdrpou("123456789")).toBe(false);
      expect(isValidEdrpou("")).toBe(false);
    });

    it("rejects non-digit input", () => {
      expect(isValidEdrpou("ABCDEFGH")).toBe(false);
      expect(isValidEdrpou("1234567a")).toBe(false);
    });

    it("handles leading zeros", () => {
      expect(isValidEdrpou("00032112")).toBe(true);
      expect(isValidEdrpou("00131305")).toBe(true);
    });

    it("normalizes before validation", () => {
      expect(isValidEdrpou("14-360-570")).toBe(true);
      expect(isValidEdrpou(" 14360570 ")).toBe(true);
    });

    it("handles null/undefined", () => {
      expect(isValidEdrpou(null)).toBe(false);
      expect(isValidEdrpou(undefined)).toBe(false);
    });
  });

  describe("isValidRnokpp", () => {
    // 10-digit РНОКПП із валідною контрольною сумою (синтетичні).
    it.each([["2222222225"], ["3333333332"], ["1234567899"]])(
      "accepts valid RNOKPP %s",
      (rnokpp) => {
        expect(isValidRnokpp(rnokpp)).toBe(true);
      },
    );

    it.each([["1234567890"], ["0000000001"], ["2222222220"], ["3333333339"]])(
      "rejects invalid RNOKPP %s",
      (rnokpp) => {
        expect(isValidRnokpp(rnokpp)).toBe(false);
      },
    );

    it("rejects wrong length", () => {
      expect(isValidRnokpp("123456789")).toBe(false);
      expect(isValidRnokpp("12345678901")).toBe(false);
    });

    it("rejects non-digit", () => {
      expect(isValidRnokpp("ABCDEFGHIJ")).toBe(false);
    });
  });

  describe("isValidTaxId", () => {
    it("dispatches by length", () => {
      expect(isValidTaxId("14360570")).toBe(true); // EDRPOU
      expect(isValidTaxId("2222222225")).toBe(true); // RNOKPP
      expect(isValidTaxId("123")).toBe(false);
      expect(isValidTaxId("123456789")).toBe(false); // not 8 nor 10
    });
  });
});
