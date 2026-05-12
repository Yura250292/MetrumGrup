import { describe, it, expect, afterEach } from "@jest/globals";

import { isFinanceAutopublishEnabled } from "../feature-flags";

describe("isFinanceAutopublishEnabled", () => {
  const original = process.env.FINANCE_AUTOPUBLISH_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.FINANCE_AUTOPUBLISH_ENABLED;
    } else {
      process.env.FINANCE_AUTOPUBLISH_ENABLED = original;
    }
  });

  it("за замовч. (unset) — вимкнено", () => {
    delete process.env.FINANCE_AUTOPUBLISH_ENABLED;
    expect(isFinanceAutopublishEnabled()).toBe(false);
  });

  it("явне 'true' — увімкнено", () => {
    process.env.FINANCE_AUTOPUBLISH_ENABLED = "true";
    expect(isFinanceAutopublishEnabled()).toBe(true);
  });

  it("'1' / 'TRUE' / 'on' не активують прапор (тільки рядок 'true')", () => {
    process.env.FINANCE_AUTOPUBLISH_ENABLED = "1";
    expect(isFinanceAutopublishEnabled()).toBe(false);
    process.env.FINANCE_AUTOPUBLISH_ENABLED = "TRUE";
    expect(isFinanceAutopublishEnabled()).toBe(false);
    process.env.FINANCE_AUTOPUBLISH_ENABLED = "on";
    expect(isFinanceAutopublishEnabled()).toBe(false);
  });
});
