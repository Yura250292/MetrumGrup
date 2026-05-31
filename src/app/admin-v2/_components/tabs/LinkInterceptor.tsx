"use client";

import { useEffect } from "react";
import { useTabs } from "./TabsProvider";

function normalize(path: string): string {
  if (path.length > "/admin-v2".length && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

/**
 * Global click capture: intercepts <a> clicks within admin-v2 so that
 *  - Cmd/Ctrl/middle-click opens the path in a background tab (no nav);
 *  - plain clicks on links to already-open paths simply switch tabs
 *    instead of letting Next.js create a duplicate.
 *
 * Plain clicks on new paths fall through to Next.js navigation; the
 * TabsProvider's pathname watcher then materialises a tab for the URL.
 */
export function LinkInterceptor() {
  const { state, openTab, setActiveTab } = useTabs();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (e.defaultPrevented) return;
      // ignore key combos that suggest the user wants new browser tab (Shift)
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (!href.startsWith("/admin-v2")) return;

      const path = normalize(href);
      const isMod = e.metaKey || e.ctrlKey;
      const isMiddle = e.button === 1;

      if (isMod || isMiddle) {
        e.preventDefault();
        openTab(path, { background: true });
        return;
      }

      if (e.button !== 0) return;

      // Якщо href збігається з поточною повною URL (pathname + search) —
      // нічого робити не треба (вже там). Інакше дамо Next.js навігувати
      // навіть якщо pathname той самий — це потрібно щоб клік на "Огляд"
      // (бare /admin-v2/projects/X) з URL з ?tab=tasks реально перейшов
      // і скинув query string.
      const targetFull = href; // як написано у Link
      const currentFull = window.location.pathname + window.location.search;
      if (targetFull === currentFull) {
        e.preventDefault();
        return;
      }

      // Browser-tabs feature: якщо така ж path уже відкрита в іншому
      // browser-tab — переключаємо туди БЕЗ дублювання. Але якщо це
      // активний tab + URL відрізняється query — пропускаємо
      // (Next.js саме навігуватиме і оновить tab.path watcher-ом).
      const targetPathOnly = path; // без query
      const currentPath = normalize(window.location.pathname);
      const isSamePath = targetPathOnly === currentPath;
      if (isSamePath) {
        // Той самий pathname → дамо Next.js навігувати (query change).
        return;
      }

      const existing = state.tabs.find((t) => t.path === path);
      if (existing) {
        e.preventDefault();
        setActiveTab(existing.id);
      }
      // else: let Next.js navigate; pathname watcher in provider will
      // create the implicit tab.
    }
    // capture so we run before Link's own handler
    document.addEventListener("click", handler, true);
    // middle-click fires via "auxclick"
    document.addEventListener("auxclick", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("auxclick", handler, true);
    };
  }, [state.tabs, openTab, setActiveTab]);

  return null;
}
