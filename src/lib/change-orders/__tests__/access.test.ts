import { canCreateCO, maskCostImpact } from "../access";

describe("canCreateCO", () => {
  test.each([
    ["MANAGER", true],
    ["ENGINEER", true],
    ["SUPER_ADMIN", true],
    ["CLIENT", false],
    ["HR", false],
    ["FINANCIER", false],
    ["FOREMAN", false],
    [null, false],
    [undefined, false],
    ["", false],
  ])("%s → %s", (role, expected) => {
    expect(canCreateCO(role as string | null | undefined)).toBe(expected);
  });
});

describe("maskCostImpact", () => {
  const co = {
    id: "co-1",
    costImpact: 1500,
    items: [
      { id: "i1", unitPrice: 100, totalPrice: 500, description: "a" },
      { id: "i2", unitPrice: 200, totalPrice: 1000, description: "b" },
    ],
  };

  test("SUPER_ADMIN receives unchanged shape", () => {
    expect(maskCostImpact(co, "SUPER_ADMIN")).toBe(co);
  });

  test("MANAGER gets costImpact=null and items unitPrice/totalPrice=null", () => {
    const masked = maskCostImpact(co, "MANAGER") as typeof co;
    expect(masked.costImpact).toBeNull();
    expect(masked.items[0].unitPrice).toBeNull();
    expect(masked.items[0].totalPrice).toBeNull();
    expect(masked.items[0].description).toBe("a"); // unrelated fields preserved
  });

  test("CLIENT also masked (non-finance role)", () => {
    const masked = maskCostImpact(co, "CLIENT") as typeof co;
    expect(masked.costImpact).toBeNull();
  });
});
