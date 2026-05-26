import { Prisma } from "@prisma/client";
import { calcBidTotalPrice } from "../pricing";

describe("procurement/pricing.calcBidTotalPrice", () => {
  test("empty array → 0", () => {
    expect(calcBidTotalPrice([]).toString()).toBe("0");
  });

  test("одна позиція з Decimal precision", () => {
    const total = calcBidTotalPrice([
      { qty: new Prisma.Decimal("2.5"), unitPrice: new Prisma.Decimal("100.33") },
    ]);
    expect(total.toString()).toBe("250.825");
  });

  test("кілька позицій сумуються коректно", () => {
    const total = calcBidTotalPrice([
      { qty: 10, unitPrice: 42.5 },
      { qty: "5", unitPrice: "20.10" },
    ]);
    // 10 * 42.5 = 425; 5 * 20.10 = 100.5; total = 525.5
    expect(total.toString()).toBe("525.5");
  });

  test("негативна qty / unitPrice кидає", () => {
    expect(() =>
      calcBidTotalPrice([{ qty: -1, unitPrice: 100 }]),
    ).toThrow(/qty must be/);
    expect(() =>
      calcBidTotalPrice([{ qty: 1, unitPrice: -100 }]),
    ).toThrow(/unitPrice must be/);
  });

  test("useAlternative використовує alternativeOfferPrice", () => {
    const total = calcBidTotalPrice([
      {
        qty: 2,
        unitPrice: 100,
        alternativeOfferPrice: 80,
        useAlternative: true,
      },
    ]);
    // 2 * 80 = 160
    expect(total.toString()).toBe("160");
  });

  test("useAlternative=true з null altPrice ігнорується (fallback на unitPrice)", () => {
    const total = calcBidTotalPrice([
      { qty: 2, unitPrice: 100, alternativeOfferPrice: null, useAlternative: true },
    ]);
    expect(total.toString()).toBe("200");
  });
});
