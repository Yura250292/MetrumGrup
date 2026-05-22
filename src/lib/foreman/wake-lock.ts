/**
 * Screen Wake Lock helper. Утримує екран увімкненим під час довгих операцій
 * (AI furnish, photoreal render, material/labor quotes), щоб PWA не "засипав"
 * і запит не зривався, коли екран гасне.
 *
 * Підтримка:
 * - iOS Safari 16.4+
 * - Chrome/Edge/Opera/Samsung Internet
 * - Firefox: НЕ підтримує (fallback — silent no-op)
 *
 * Usage:
 *   const release = await acquireWakeLock();
 *   try {
 *     await longTask();
 *   } finally {
 *     await release();
 *   }
 */

// Браузерні типи Wake Lock не повсюди — використовуємо локальну декларацію
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (event: "release", listener: () => void) => void;
}

interface WakeLockNavigator {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

let currentLock: WakeLockSentinelLike | null = null;
let refCount = 0;

async function ensureLock(): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator as unknown as WakeLockNavigator;
  if (!nav.wakeLock) return;
  if (currentLock && !currentLock.released) return;
  try {
    currentLock = await nav.wakeLock.request("screen");
    currentLock.addEventListener?.("release", () => {
      currentLock = null;
    });
  } catch {
    // permission denied / not supported — silent
    currentLock = null;
  }
}

async function maybeReleaseLock(): Promise<void> {
  if (!currentLock || currentLock.released) {
    currentLock = null;
    return;
  }
  try {
    await currentLock.release();
  } catch {
    // ignore
  }
  currentLock = null;
}

/**
 * Acquire wake lock з reference counting — багатоканальні виклики не плутають
 * один одного. Повертає release-функцію.
 */
export async function acquireWakeLock(): Promise<() => Promise<void>> {
  refCount++;
  await ensureLock();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    refCount--;
    if (refCount <= 0) {
      refCount = 0;
      await maybeReleaseLock();
    }
  };
}

/**
 * Якщо документ повертається з невидимого стану — пробуємо переотримати lock
 * (iOS іноді сам звільняє при візібіліті change).
 */
export function installWakeLockResumeHandler(): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "visible" && refCount > 0) {
      void ensureLock();
    }
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
