/**
 * Sanity tests for password-reset token hashing primitives.
 *
 * Full integration of `/api/auth/forgot-password` and `/api/auth/reset-password`
 * is covered by E2E suite (Sprint 6 — Playwright) and a manual Beta runbook,
 * since they exercise Prisma + Resend together.
 */
import crypto from "crypto";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

describe("password-reset token primitives", () => {
  it("hash is deterministic", () => {
    const tok = "abcdef0123456789";
    expect(hashToken(tok)).toBe(hashToken(tok));
  });

  it("hash differs for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("hash is 64 hex chars (sha256)", () => {
    const h = hashToken("anything");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generated tokens are 64 hex chars (32 random bytes)", () => {
    const raw = crypto.randomBytes(32).toString("hex");
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generated tokens are not predictable across calls", () => {
    const a = crypto.randomBytes(32).toString("hex");
    const b = crypto.randomBytes(32).toString("hex");
    expect(a).not.toBe(b);
  });
});
