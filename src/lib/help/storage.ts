function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage blocked or full — degrade silently */
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function introKey(route: string, version: number): string {
  return `help:intro:${route}:v${version}`;
}

export function tourKey(tourId: string, version: number): string {
  return `help:tour:${tourId}:completed:v${version}`;
}

export function isIntroDismissed(route: string, version: number): boolean {
  return safeGet(introKey(route, version)) === "dismissed";
}

export function dismissIntro(route: string, version: number): void {
  safeSet(introKey(route, version), "dismissed");
}

export function resetIntro(route: string, version: number): void {
  safeRemove(introKey(route, version));
}

export function isTourCompleted(tourId: string, version: number): boolean {
  return safeGet(tourKey(tourId, version)) === "1";
}

export function markTourCompleted(tourId: string, version: number): void {
  safeSet(tourKey(tourId, version), "1");
}
