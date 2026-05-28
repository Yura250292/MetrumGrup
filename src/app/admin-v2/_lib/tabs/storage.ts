import type { TabsState } from "./types";
import { STORAGE_TTL_MS, STORAGE_VERSION } from "./types";

interface StoredPayload {
  v: number;
  savedAt: number;
  state: TabsState;
}

function keyFor(scope: string): string {
  return `admin-v2:tabs:v${STORAGE_VERSION}:${scope}`;
}

function isValidPath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith("/admin-v2");
}

export function loadTabs(scope: string): TabsState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    if (!parsed || parsed.v !== STORAGE_VERSION) return null;
    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) return null;
    const tabs = Array.isArray(parsed.state?.tabs)
      ? parsed.state.tabs.filter(
          (t) =>
            t &&
            typeof t.id === "string" &&
            isValidPath(t.path) &&
            typeof t.title === "string",
        )
      : [];
    if (tabs.length === 0) return null;
    const activeTabId =
      parsed.state.activeTabId &&
      tabs.some((t) => t.id === parsed.state.activeTabId)
        ? parsed.state.activeTabId
        : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

export function saveTabs(scope: string, state: TabsState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload = {
      v: STORAGE_VERSION,
      savedAt: Date.now(),
      state,
    };
    window.localStorage.setItem(keyFor(scope), JSON.stringify(payload));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function clearTabs(scope: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(scope));
  } catch {
    // ignore
  }
}
