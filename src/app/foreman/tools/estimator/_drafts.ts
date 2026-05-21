/**
 * Іменовані чернетки кошторису. Окремо від autosave (foreman:estimator:draft:v1):
 * - autosave — поточний робочий стейт, перезаписується кожні 500ms
 * - drafts (тут) — список свідомо збережених чернеток із назвами
 */

import type { EstimatorState } from "./_types";

const DRAFTS_KEY = "foreman:estimator:drafts:v1";

export interface SavedDraft {
  id: string;
  name: string;
  savedAt: number;
  /** Persisted state without `step` field. */
  state: Omit<EstimatorState, "step">;
}

function safeGetList(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedDraft[];
  } catch {
    return [];
  }
}

function safeSetList(list: SavedDraft[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function listDrafts(): SavedDraft[] {
  return safeGetList()
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveDraftAs(
  name: string,
  state: EstimatorState,
): SavedDraft {
  const { step: _step, ...persistable } = state;
  void _step;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const draft: SavedDraft = {
    id,
    name: name.trim() || `Чернетка ${new Date().toLocaleString("uk-UA")}`,
    savedAt: Date.now(),
    state: persistable,
  };
  const list = safeGetList();
  list.push(draft);
  // ліміт — 30 чернеток (видаляємо найстаріші)
  if (list.length > 30) {
    list.sort((a, b) => a.savedAt - b.savedAt);
    list.splice(0, list.length - 30);
  }
  safeSetList(list);
  return draft;
}

export function updateDraft(
  id: string,
  patch: Partial<Pick<SavedDraft, "name">> & {
    state?: EstimatorState;
  },
): void {
  const list = safeGetList();
  const idx = list.findIndex((d) => d.id === id);
  if (idx < 0) return;
  if (patch.name !== undefined) list[idx].name = patch.name;
  if (patch.state) {
    const { step: _step, ...persistable } = patch.state;
    void _step;
    list[idx].state = persistable;
    list[idx].savedAt = Date.now();
  }
  safeSetList(list);
}

export function deleteDraft(id: string): void {
  const list = safeGetList().filter((d) => d.id !== id);
  safeSetList(list);
}

export function getDraft(id: string): SavedDraft | null {
  return safeGetList().find((d) => d.id === id) ?? null;
}
