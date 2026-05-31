"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTabs } from "./TabsProvider";

function normalize(path: string): string {
  if (path.length > "/admin-v2".length && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

/**
 * Keep-mounted tab renderer. Caches the React element subtree the first
 * time each tab is rendered; subsequent renders of the same tab reuse the
 * cached element so React preserves the subtree (state, focus, effects,
 * React Query subscriptions). Inactive tabs are hidden via the `hidden`
 * attribute — they remain mounted in the DOM.
 *
 * Implementation contract:
 *  - `children` is whatever Next.js renders for the current pathname.
 *  - On each render we look up which tab matches the current pathname,
 *    cache `children` under that tab's id (only if not already cached or
 *    if reloadTab bumped its key), and render the union of all cached
 *    subtrees.
 *  - Cache entries for closed tabs are dropped.
 */
export function TabsViewport({ children }: { children: ReactNode }) {
  const { state, reloadKeyFor } = useTabs();
  const pathname = normalize(usePathname() ?? "/admin-v2");

  const cacheRef = useRef<Map<string, { node: ReactNode; reloadKey: number }>>(
    new Map(),
  );

  // Cache the current children under the tab whose path matches.
  // Prefer the active tab when there are multiple matches (defensive).
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
  const targetTab =
    activeTab && activeTab.path === pathname
      ? activeTab
      : state.tabs.find((t) => t.path === pathname);

  if (targetTab) {
    const currentReloadKey = reloadKeyFor(targetTab.id);
    const cached = cacheRef.current.get(targetTab.id);
    if (!cached || cached.reloadKey !== currentReloadKey) {
      cacheRef.current.set(targetTab.id, {
        node: children,
        reloadKey: currentReloadKey,
      });
    }
  }

  // Prune cache for tabs that no longer exist.
  if (cacheRef.current.size > state.tabs.length) {
    const liveIds = new Set(state.tabs.map((t) => t.id));
    for (const id of Array.from(cacheRef.current.keys())) {
      if (!liveIds.has(id)) cacheRef.current.delete(id);
    }
  }

  // Fallback: якщо state.tabs пустий АБО жоден tab не відповідає поточному
  // pathname (rare race під час hydration), просто рендеримо children без
  // кешування. Це гарантує що користувач завжди бачить контент.
  const hasMatchingCached =
    targetTab && cacheRef.current.has(targetTab.id);
  if (!hasMatchingCached) {
    return <>{children}</>;
  }

  return (
    <>
      {state.tabs.map((tab) => {
        const cached = cacheRef.current.get(tab.id);
        if (!cached) return null;
        const isActive = tab.id === state.activeTabId;
        return (
          <div
            key={`${tab.id}:${cached.reloadKey}`}
            role="tabpanel"
            aria-hidden={!isActive}
            hidden={!isActive}
            style={isActive ? undefined : { display: "none" }}
          >
            {cached.node}
          </div>
        );
      })}
    </>
  );
}
