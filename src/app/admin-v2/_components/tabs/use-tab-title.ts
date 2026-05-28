"use client";

import { useEffect } from "react";
import { useTabsOptional } from "./TabsProvider";

/**
 * Updates the active tab's title. Call inside client components for
 * dynamic routes (e.g. /projects/[id]) so the tab label reflects the
 * actual entity instead of the generic fallback from title-resolver.
 */
export function useTabTitle(title: string | null | undefined): void {
  const tabs = useTabsOptional();
  useEffect(() => {
    if (!tabs || !title) return;
    const id = tabs.activeTabIdRef.current;
    if (!id) return;
    tabs.setTabTitle(id, title);
  }, [tabs, title]);
}
