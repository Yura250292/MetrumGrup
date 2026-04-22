"use client";

import { useCallback, useSyncExternalStore } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { LucideIcon } from "lucide-react";

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

export function ViewModeSwitcher<V extends string>({ value, options, onChange, ariaLabel }: Props<V>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-md p-0.5"
      style={{
        backgroundColor: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] font-medium transition"
            style={{
              backgroundColor: active ? T.panel : "transparent",
              color: active ? T.textPrimary : T.textSecondary,
              boxShadow: active ? `0 1px 2px rgba(0,0,0,0.05)` : undefined,
            }}
          >
            {Icon && <Icon size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
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
