"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardLayout, WidgetInstance, WidgetType } from "./layout-schema";

const QUERY_KEY = ["dashboard-layout"] as const;
const LOCAL_CACHE_KEY = "dashboard-layout:v1";
const LEGACY_CONFIG_KEY = "dashboard-widget-config";

const DEFAULT_DESKTOP: WidgetInstance[] = [
  { id: "w-attention", type: "attention", size: "4x1", order: 0 },
  { id: "w-kpi-business", type: "kpi-business", size: "4x1", order: 1 },
  { id: "w-my-tasks", type: "my-tasks", size: "2x2", order: 2 },
  { id: "w-meetings", type: "meetings", size: "2x1", order: 3 },
  { id: "w-chats", type: "chats", size: "2x1", order: 4 },
  { id: "w-finance-quick", type: "finance-quick", size: "2x1", order: 5 },
  { id: "w-kpi-tasks", type: "kpi-tasks", size: "4x1", order: 6 },
  { id: "w-finance", type: "finance-pulse", size: "2x2", order: 7 },
  { id: "w-team", type: "team", size: "2x1", order: 8 },
  { id: "w-stages", type: "stages", size: "2x1", order: 9 },
  { id: "w-projects-risk", type: "projects-risk", size: "4x2", order: 10 },
  { id: "w-activity", type: "activity", size: "2x2", order: 11 },
  { id: "w-ai-widget", type: "ai-widget", size: "2x2", order: 12 },
];

export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  desktop: { widgets: DEFAULT_DESKTOP },
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function readLocalCache(): DashboardLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as DashboardLayout) : null;
  } catch {
    return null;
  }
}

function writeLocalCache(layout: DashboardLayout) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(layout));
  } catch {
    /* quota; ignore */
  }
}

function migrateLegacyConfig(): DashboardLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) return null;
    const visible = new Set(JSON.parse(raw) as string[]);
    const legacyToType: Record<string, WidgetType> = { finance: "finance-pulse" };
    const kept = DEFAULT_DESKTOP.filter((w) => {
      const legacyId =
        Object.entries(legacyToType).find(([, v]) => v === w.type)?.[0] ?? w.type;
      return visible.has(w.type) || visible.has(legacyId);
    });
    return {
      version: 1,
      desktop: { widgets: kept.length ? kept : DEFAULT_DESKTOP },
    };
  } catch {
    return null;
  }
}

export function useDashboardLayout() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const resp = await jsonFetch<{ data: DashboardLayout | null }>(
        "/api/admin/me/dashboard-layout",
      );
      if (resp.data) return resp.data;
      const migrated = migrateLegacyConfig();
      return migrated ?? readLocalCache() ?? DEFAULT_LAYOUT;
    },
    staleTime: 60_000,
    initialData: () => readLocalCache() ?? DEFAULT_LAYOUT,
  });

  useEffect(() => {
    if (query.data) writeLocalCache(query.data);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (layout: DashboardLayout) =>
      jsonFetch<{ data: DashboardLayout }>("/api/admin/me/dashboard-layout", {
        method: "PUT",
        body: JSON.stringify(layout),
      }).then((r) => r.data),
    onMutate: async (layout) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<DashboardLayout>(QUERY_KEY);
      qc.setQueryData(QUERY_KEY, layout);
      writeLocalCache(layout);
      return { prev };
    },
    onError: (_err, _layout, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const debouncedSave = useDebouncedCallback((layout: DashboardLayout) => {
    mutation.mutate(layout);
  }, 500);

  const save = useMemo(
    () => ({
      commit: debouncedSave,
      flush: (layout: DashboardLayout) => mutation.mutate(layout),
      isSaving: mutation.isPending,
    }),
    [debouncedSave, mutation.isPending, mutation.mutate],
  );

  return { layout: query.data ?? DEFAULT_LAYOUT, isLoading: query.isLoading, save };
}

function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delayMs: number) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  fnRef.current = fn;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => fnRef.current(...args), delayMs);
      }) as T,
    [delayMs],
  );
}
