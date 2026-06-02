import { describe, it, expect } from "@jest/globals";
import { reconcileLine } from "@/lib/projects/estimate-reconcile";

describe("reconcileLine", () => {
  it("ok коли amount = quantity × unitPrice", () => {
    const r = reconcileLine(5, 200, 1000);
    expect(r.status).toBe("ok");
    expect(r.expected).toBe(1000);
  });

  it("mismatch коли стейтед сума не сходиться (помилка в кошторисі)", () => {
    const r = reconcileLine(5, 200, 1200);
    expect(r.status).toBe("mismatch");
    expect(r.expected).toBe(1000);
    expect(r.diff).toBe(200);
  });

  it("округлення в межах допуску → ok", () => {
    const r = reconcileLine(3, 33.33, 99.99); // 3×33.33=99.99
    expect(r.status).toBe("ok");
  });

  it("малий відхил у межах 0.5 грн → ok", () => {
    const r = reconcileLine(2, 10, 20.4);
    expect(r.status).toBe("ok");
  });

  it("na коли бракує даних", () => {
    expect(reconcileLine(null, 200, 1000).status).toBe("na");
    expect(reconcileLine(5, null, 1000).status).toBe("na");
    expect(reconcileLine(5, 200, null).status).toBe("na");
  });

  it("великі суми: 0.5% допуск", () => {
    // expected=100000, допуск=500 → 100400 ok, 100600 mismatch
    expect(reconcileLine(1000, 100, 100400).status).toBe("ok");
    expect(reconcileLine(1000, 100, 100600).status).toBe("mismatch");
  });
});
