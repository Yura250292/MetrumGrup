"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Tab, TabId, TabsState } from "../../_lib/tabs/types";
import { TAB_CAP } from "../../_lib/tabs/types";
import { loadTabs, saveTabs } from "../../_lib/tabs/storage";
import { resolveTabMeta } from "../../_lib/tabs/title-resolver";

interface TabsApi {
  state: TabsState;
  openTab: (path: string, opts?: { background?: boolean }) => TabId;
  closeTab: (id: TabId) => void;
  closeOthers: (id: TabId) => void;
  closeRight: (id: TabId) => void;
  setActiveTab: (id: TabId) => void;
  reloadTab: (id: TabId) => void;
  setTabTitle: (id: TabId, title: string) => void;
  reloadKeyFor: (id: TabId) => number;
  activeTabIdRef: { current: TabId | null };
}

const TabsContext = createContext<TabsApi | null>(null);

function makeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID === "function"
  ) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeTab(path: string): Tab {
  const meta = resolveTabMeta(path);
  const now = Date.now();
  return {
    id: makeId(),
    path,
    title: meta.title,
    iconKey: meta.iconKey,
    createdAt: now,
    lastActiveAt: now,
  };
}

function normalize(path: string): string {
  // strip trailing slash (except root /admin-v2)
  if (path.length > "/admin-v2".length && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

export function TabsProvider({
  children,
  userId,
  firmScope,
}: {
  children: ReactNode;
  userId: string;
  firmScope?: string | null;
}) {
  const pathname = usePathname() ?? "/admin-v2";
  const router = useRouter();
  // Scope per-user AND per-firm so Group/Studio tab sets stay fully isolated
  // (matches project_metrum_full_firm_isolation rule).
  const scope = `${userId}:${firmScope ?? "default"}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // Lazy initial state: at least one tab for the current pathname so the
  // viewport has something to render on first paint (avoids blank-flash
  // while the hydration effect runs).
  const [state, setState] = useState<TabsState>(() => {
    const initialPath =
      typeof window !== "undefined"
        ? normalize(window.location.pathname || "/admin-v2")
        : "/admin-v2";
    const fresh = makeTab(initialPath);
    return { tabs: [fresh], activeTabId: fresh.id };
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeTabIdRef = useRef<TabId | null>(null);
  activeTabIdRef.current = state.activeTabId;

  const [reloadKeys, setReloadKeys] = useState<Record<TabId, number>>({});

  const hydratedRef = useRef(false);

  // Hydrate from storage (once per user/firm scope).
  // Merges restored tabs with the synchronously-created "current pathname" tab,
  // dropping the restored entry that matches the current path (we already
  // have a fresh tab object for it from the lazy initializer).
  useEffect(() => {
    hydratedRef.current = false;
    const restored = loadTabs(scope);
    const normalizedCurrent = normalize(pathname);
    if (restored && restored.tabs.length > 0) {
      const existing = restored.tabs.find((t) => t.path === normalizedCurrent);
      if (existing) {
        setState({ tabs: restored.tabs, activeTabId: existing.id });
      } else {
        // Keep the current synchronously-created tab + append restored
        // ones that don't duplicate the current path.
        setState((prev) => {
          const currentTab =
            prev.tabs.find((t) => t.path === normalizedCurrent) ??
            makeTab(normalizedCurrent);
          const others = restored.tabs.filter(
            (t) => t.path !== normalizedCurrent,
          );
          return {
            tabs: [...others, currentTab],
            activeTabId: currentTab.id,
          };
        });
      }
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Persist on every change
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (state.tabs.length === 0) return;
    saveTabs(scopeRef.current, state);
  }, [state]);

  // Sync with pathname changes (handles back/forward + direct nav)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const normalized = normalize(pathname);
    setState((prev) => {
      const existing = prev.tabs.find((t) => t.path === normalized);
      if (existing) {
        if (prev.activeTabId === existing.id) return prev;
        return {
          tabs: prev.tabs.map((t) =>
            t.id === existing.id ? { ...t, lastActiveAt: Date.now() } : t,
          ),
          activeTabId: existing.id,
        };
      }
      // Create implicit tab for previously-unseen path
      const fresh = makeTab(normalized);
      return {
        tabs: [...prev.tabs, fresh],
        activeTabId: fresh.id,
      };
    });
  }, [pathname]);

  const setActiveTab = useCallback(
    (id: TabId) => {
      const tab = stateRef.current.tabs.find((t) => t.id === id);
      if (!tab) return;
      setState((prev) => ({
        tabs: prev.tabs.map((t) =>
          t.id === id ? { ...t, lastActiveAt: Date.now() } : t,
        ),
        activeTabId: id,
      }));
      if (normalize(pathname) !== tab.path) {
        router.push(tab.path);
      }
    },
    [pathname, router],
  );

  const openTab = useCallback(
    (rawPath: string, opts?: { background?: boolean }): TabId => {
      const path = normalize(rawPath);
      const existing = stateRef.current.tabs.find((t) => t.path === path);
      if (existing) {
        if (!opts?.background) setActiveTab(existing.id);
        return existing.id;
      }
      // Enforce cap with LRU eviction of unpinned
      let tabs = [...stateRef.current.tabs];
      if (tabs.length >= TAB_CAP) {
        const candidates = tabs
          .filter((t) => !t.pinned && t.id !== stateRef.current.activeTabId)
          .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        if (candidates.length > 0) {
          const evict = candidates[0];
          tabs = tabs.filter((t) => t.id !== evict.id);
        }
      }
      const fresh = makeTab(path);
      setState({
        tabs: [...tabs, fresh],
        activeTabId: opts?.background
          ? stateRef.current.activeTabId
          : fresh.id,
      });
      if (!opts?.background) {
        router.push(path);
      }
      return fresh.id;
    },
    [router, setActiveTab],
  );

  const closeTab = useCallback(
    (id: TabId) => {
      setState((prev) => {
        const idx = prev.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const remaining = prev.tabs.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          // never close the last tab — replace with dashboard
          const fresh = makeTab("/admin-v2");
          router.push(fresh.path);
          return { tabs: [fresh], activeTabId: fresh.id };
        }
        let nextActiveId = prev.activeTabId;
        if (prev.activeTabId === id) {
          const fallback = remaining[Math.min(idx, remaining.length - 1)];
          nextActiveId = fallback.id;
          router.push(fallback.path);
        }
        return { tabs: remaining, activeTabId: nextActiveId };
      });
    },
    [router],
  );

  const closeOthers = useCallback(
    (id: TabId) => {
      setState((prev) => {
        const keep = prev.tabs.find((t) => t.id === id);
        if (!keep) return prev;
        const pinned = prev.tabs.filter((t) => t.pinned && t.id !== id);
        const tabs = [...pinned, keep];
        if (prev.activeTabId !== id) router.push(keep.path);
        return { tabs, activeTabId: id };
      });
    },
    [router],
  );

  const closeRight = useCallback((id: TabId) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const head = prev.tabs.slice(0, idx + 1);
      const tail = prev.tabs.slice(idx + 1).filter((t) => t.pinned);
      const tabs = [...head, ...tail];
      const activeStillThere = tabs.some((t) => t.id === prev.activeTabId);
      return {
        tabs,
        activeTabId: activeStillThere ? prev.activeTabId : id,
      };
    });
  }, []);

  const reloadTab = useCallback((id: TabId) => {
    setReloadKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const setTabTitle = useCallback((id: TabId, title: string) => {
    setState((prev) => {
      const existing = prev.tabs.find((t) => t.id === id);
      if (!existing || existing.title === title) return prev;
      return {
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
      };
    });
  }, []);

  const reloadKeyFor = useCallback(
    (id: TabId) => reloadKeys[id] ?? 0,
    [reloadKeys],
  );

  const api = useMemo<TabsApi>(
    () => ({
      state,
      openTab,
      closeTab,
      closeOthers,
      closeRight,
      setActiveTab,
      reloadTab,
      setTabTitle,
      reloadKeyFor,
      activeTabIdRef,
    }),
    [
      state,
      openTab,
      closeTab,
      closeOthers,
      closeRight,
      setActiveTab,
      reloadTab,
      setTabTitle,
      reloadKeyFor,
    ],
  );

  return <TabsContext.Provider value={api}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsApi {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within TabsProvider");
  return ctx;
}

export function useTabsOptional(): TabsApi | null {
  return useContext(TabsContext);
}
