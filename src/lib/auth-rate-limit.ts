import { log } from "@/lib/logger";

/**
 * Per-email failed-login tracker.
 *
 * In-memory, single-instance. For multi-instance (Vercel), back this with
 * Redis/Upstash so the limit is global.
 */

type Entry = { failures: number; lockedUntil: number | null };

const MAX_FAILURES = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 5);
const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);

const attempts = new Map<string, Entry>();

function keyFor(email: string): string {
  return email.trim().toLowerCase();
}

export function isLocked(email: string): boolean {
  const entry = attempts.get(keyFor(email));
  if (!entry?.lockedUntil) return false;
  if (entry.lockedUntil <= Date.now()) {
    attempts.delete(keyFor(email));
    return false;
  }
  return true;
}

export function recordFailure(email: string): void {
  const k = keyFor(email);
  const existing = attempts.get(k) ?? { failures: 0, lockedUntil: null };
  existing.failures += 1;
  if (existing.failures >= MAX_FAILURES) {
    existing.lockedUntil = Date.now() + WINDOW_MS;
    log.warn("auth:locked", { email: k, failures: existing.failures, windowMs: WINDOW_MS });
  }
  attempts.set(k, existing);
}

export function recordSuccess(email: string): void {
  attempts.delete(keyFor(email));
}
