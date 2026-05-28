"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqualValue(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!isEqualValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

export type GuardIntent = "save" | "discard" | "continue";

export type GuardState = {
  open: boolean;
  resolve: ((intent: GuardIntent) => void) | null;
};

export type UseDirtyFormResult<T extends Record<string, unknown>> = {
  values: T;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  setValues: (updater: T | ((prev: T) => T)) => void;
  dirtyFields: ReadonlySet<keyof T & string>;
  isDirty: boolean;
  dirtyCount: number;
  reset: () => void;
  resetBaseline: (next?: T) => void;
  saving: boolean;
  save: () => Promise<boolean>;
  attemptClose: (close: () => void) => void;
  guardOpen: boolean;
  resolveGuard: (intent: GuardIntent) => void;
  /** Fields that should not count as dirty (e.g. transient buffers like pendingFiles). */
};

export function useDirtyForm<T extends Record<string, unknown>>({
  initial,
  onSave,
  ignoreKeys,
  beforeUnload = true,
}: {
  initial: T;
  onSave: (values: T) => Promise<void> | void;
  ignoreKeys?: ReadonlyArray<keyof T & string>;
  beforeUnload?: boolean;
}): UseDirtyFormResult<T> {
  const [values, setValuesState] = useState<T>(initial);
  const baselineRef = useRef<T>(initial);
  const [saving, setSaving] = useState(false);
  const [guard, setGuard] = useState<GuardState>({ open: false, resolve: null });
  const ignored = useMemo(() => new Set(ignoreKeys ?? []), [ignoreKeys]);

  const dirtyFields = useMemo(() => {
    const out = new Set<keyof T & string>();
    const base = baselineRef.current;
    const keys = new Set<string>([...Object.keys(base), ...Object.keys(values)]);
    for (const k of keys) {
      if (ignored.has(k as keyof T & string)) continue;
      if (!isEqualValue((values as Record<string, unknown>)[k], (base as Record<string, unknown>)[k])) {
        out.add(k as keyof T & string);
      }
    }
    return out;
  }, [values, ignored]);

  const isDirty = dirtyFields.size > 0;

  useEffect(() => {
    if (!beforeUnload || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [beforeUnload, isDirty]);

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValuesState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setValues = useCallback((updater: T | ((prev: T) => T)) => {
    setValuesState((prev) =>
      typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater,
    );
  }, []);

  const reset = useCallback(() => {
    setValuesState(baselineRef.current);
  }, []);

  const resetBaseline = useCallback((next?: T) => {
    if (next) {
      baselineRef.current = next;
      setValuesState(next);
    } else {
      baselineRef.current = values;
    }
  }, [values]);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      await onSave(values);
      baselineRef.current = values;
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [onSave, values]);

  const attemptClose = useCallback(
    (close: () => void) => {
      if (!isDirty) {
        close();
        return;
      }
      setGuard({
        open: true,
        resolve: async (intent) => {
          setGuard({ open: false, resolve: null });
          if (intent === "continue") return;
          if (intent === "discard") {
            setValuesState(baselineRef.current);
            close();
            return;
          }
          if (intent === "save") {
            const ok = await save();
            if (ok) close();
          }
        },
      });
    },
    [isDirty, save],
  );

  const resolveGuard = useCallback(
    (intent: GuardIntent) => {
      guard.resolve?.(intent);
    },
    [guard],
  );

  return {
    values,
    setValue,
    setValues,
    dirtyFields,
    isDirty,
    dirtyCount: dirtyFields.size,
    reset,
    resetBaseline,
    saving,
    save,
    attemptClose,
    guardOpen: guard.open,
    resolveGuard,
  };
}
