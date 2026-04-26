"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { ToggleGroup } from "@/components/ui/toggle-group";

export type ViewModeOption<V extends string> = {
  value: V;
  label: string;
  icon?: LucideIcon;
};

type Props<V extends string> = {
  value: V;
  options: ViewModeOption<V>[];
  onChange: (value: V) => void;
  ariaLabel?: string;
};

export function ViewModeSwitcher<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: Props<V>) {
  const groupOptions = useMemo(
    () =>
      options.map((opt) => {
        const Icon = opt.icon;
        return {
          value: opt.value,
          label: opt.label,
          ariaLabel: opt.label,
          icon: Icon ? <Icon size={14} /> : undefined,
        };
      }),
    [options],
  );

  return (
    <ToggleGroup<V>
      ariaLabel={ariaLabel ?? "Режим перегляду"}
      size="sm"
      value={value}
      onValueChange={onChange}
      options={groupOptions}
    />
  );
}

// Custom storage event dispatched on same tab when we write via `update`
// (native "storage" event only fires in other tabs). Lets useSyncExternalStore
// re-render the same component that just called `update`.
const VIEW_MODE_EVENT = "admin-v2:viewMode:change";

function subscribeLocal(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(VIEW_MODE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(VIEW_MODE_EVENT, handler);
  };
}

export function usePersistedViewMode<V extends string>(
  pageKey: string,
  options: V[],
  defaultValue: V,
): [V, (v: V) => void] {
  const storageKey = `admin-v2:viewMode:${pageKey}`;

  const getSnapshot = useCallback(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && (options as readonly string[]).includes(stored)) return stored as V;
    return defaultValue;
  }, [storageKey, options, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribeLocal, getSnapshot, getServerSnapshot);

  const update = useCallback(
    (next: V) => {
      window.localStorage.setItem(storageKey, next);
      window.dispatchEvent(new Event(VIEW_MODE_EVENT));
    },
    [storageKey],
  );

  return [value, update];
}
