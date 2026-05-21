/**
 * LocalStorage чернетка для estimator-у. Bump DRAFT_KEY при ламких змінах схеми.
 */

import type { EstimatorState } from "./_types";

const DRAFT_KEY = "foreman:estimator:draft:v1";

export function loadDraft(): Partial<EstimatorState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<EstimatorState>;
  } catch {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

export function saveDraft(state: EstimatorState): void {
  if (typeof window === "undefined") return;
  try {
    const { step: _step, ...persistable } = state;
    void _step;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(persistable));
  } catch {
    // quota / private mode — ignore
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
