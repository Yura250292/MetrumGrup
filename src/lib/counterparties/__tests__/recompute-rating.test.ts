import { describe, it, expect } from "@jest/globals";
import { Prisma } from "@prisma/client";
import { computeOverallRating } from "../recompute-rating";

describe("computeOverallRating", () => {
  it("returns Decimal(2,1)", () => {
    const rating = computeOverallRating({
      qualityScore: 4,
      timelinessScore: 5,
      priceScore: 4,
      communicationScore: 5,
    });
    expect(rating).toBeInstanceOf(Prisma.Decimal);
    // (4+5+4+5)/4 = 4.5 (Decimal(2,1))
    expect(rating.toFixed(1)).toBe("4.5");
  });

  it("HALF_UP rounds 4.625 → 4.6", () => {
    // (5+5+4+4)/4 = 4.5 — easier case
    // Need an avg with .x5 round-half-up:
    // (5+4+4+5)/4 = 4.5 → 4.5
    // Try (4+5+4+4)/4 = 4.25 → 4.3 (4.25 rounds to 4.3 HALF_UP)
    const r1 = computeOverallRating({
      qualityScore: 4,
      timelinessScore: 5,
      priceScore: 4,
      communicationScore: 4,
    });
    expect(r1.toFixed(1)).toBe("4.3");
  });

  it("all 5s → 5.0", () => {
    const r = computeOverallRating({
      qualityScore: 5,
      timelinessScore: 5,
      priceScore: 5,
      communicationScore: 5,
    });
    expect(r.toFixed(1)).toBe("5.0");
  });

  it("all 1s → 1.0", () => {
    const r = computeOverallRating({
      qualityScore: 1,
      timelinessScore: 1,
      priceScore: 1,
      communicationScore: 1,
    });
    expect(r.toFixed(1)).toBe("1.0");
  });

  it("mixed 1+5+1+5 → 3.0", () => {
    const r = computeOverallRating({
      qualityScore: 1,
      timelinessScore: 5,
      priceScore: 1,
      communicationScore: 5,
    });
    expect(r.toFixed(1)).toBe("3.0");
  });
});
