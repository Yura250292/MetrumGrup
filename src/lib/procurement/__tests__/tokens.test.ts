import { generateAccessToken, isValidTokenShape } from "../tokens";

describe("procurement/tokens", () => {
  test("generateAccessToken видає унікальні токени достатньої довжини", () => {
    const count = 10_000;
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const t = generateAccessToken();
      expect(t.length).toBeGreaterThanOrEqual(32);
      expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(count);
  });

  test("isValidTokenShape rejects empty/short/invalid", () => {
    expect(isValidTokenShape(null)).toBe(false);
    expect(isValidTokenShape("")).toBe(false);
    expect(isValidTokenShape("short")).toBe(false);
    // 31 chars (just below 32) → false
    expect(isValidTokenShape("a".repeat(31))).toBe(false);
    // Invalid chars
    expect(isValidTokenShape("a".repeat(40) + "!")).toBe(false);
    // Valid form (32 chars from allowed alphabet)
    expect(isValidTokenShape("a".repeat(32))).toBe(true);
    expect(isValidTokenShape(generateAccessToken())).toBe(true);
  });

  test("rejects tokens that are absurdly long", () => {
    expect(isValidTokenShape("a".repeat(129))).toBe(false);
  });
});
