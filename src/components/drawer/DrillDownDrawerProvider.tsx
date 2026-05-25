"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DrawerEntity, DrawerStackItem } from "./types";
import {
  buildUrlWithStack,
  hasLegacyTaskParam,
  readStackFromUrl,
} from "./url-state";

const MAX_DEPTH = 5;

type DrillDownContextValue = {
  stack: ReadonlyArray<DrawerStackItem>;
  open: (entity: DrawerEntity) => void;
  back: () => void;
  replaceTop: (entity: DrawerEntity) => void;
  closeAll: () => void;
  setTopBreadcrumb: (label: string) => void;
};

export const DrillDownContext = createContext<DrillDownContextValue | null>(
  null,
);

let uidCounter = 0;
function makeUid(): string {
  uidCounter += 1;
  return `d${Date.now().toString(36)}${uidCounter}`;
}

function toStackItems(entities: ReadonlyArray<DrawerEntity>): DrawerStackItem[] {
  return entities.map((e) => ({ ...e, uid: makeUid() }));
}

function stacksEntitiesEqual(
  a: ReadonlyArray<DrawerEntity>,
  b: ReadonlyArray<DrawerEntity>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].id !== b[i].id) return false;
  }
  return true;
}

function initialStack(): DrawerStackItem[] {
  if (typeof window === "undefined") return [];
  const url = new URL(window.location.href);
  const initial = readStackFromUrl(url);
  return initial.length > 0 ? toStackItems(initial) : [];
}

export function DrillDownDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<DrawerStackItem[]>(initialStack);

  // Прапор: коли true — наступне оновлення URL пропускаємо (це popstate-driven).
  const skipNextUrlWriteRef = useRef(false);

  // Mount: 1) мігрувати legacy ?task= → ?d=task:<id>;
  //         2) підписатися на popstate і ре-синкати стек із URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (hasLegacyTaskParam(url)) {
      const initial = readStackFromUrl(url);
      if (initial.length > 0) {
        const next = buildUrlWithStack(url, initial);
        window.history.replaceState(
          window.history.state,
          "",
          `${next.pathname}${next.search}${next.hash}`,
        );
      }
    }

    const onPopState = () => {
      const popUrl = new URL(window.location.href);
      const next = readStackFromUrl(popUrl);
      // Функціональний setState — current stack читаємо без ref-міррора.
      setStack((curr) => {
        if (stacksEntitiesEqual(curr, next)) return curr;
        skipNextUrlWriteRef.current = true;
        return toStackItems(next);
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Sync stack → URL через pushState (крім popstate-driven оновлень).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipNextUrlWriteRef.current) {
      skipNextUrlWriteRef.current = false;
      return;
    }
    const url = new URL(window.location.href);
    const next = buildUrlWithStack(url, stack);
    const currentSearch = url.search;
    const nextSearch = next.search;
    if (currentSearch === nextSearch) return;
    window.history.pushState(
      window.history.state,
      "",
      `${next.pathname}${nextSearch}${next.hash}`,
    );
  }, [stack]);

  const open = useCallback((entity: DrawerEntity) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      // Дублікат на верху — no-op
      if (top && top.type === entity.type && top.id === entity.id) {
        return prev;
      }
      const item: DrawerStackItem = { ...entity, uid: makeUid() };
      const next = [...prev, item];
      if (next.length > MAX_DEPTH) {
        // Тихо викидаємо найстарший рівень. У console — warning, щоб
        // діагностувати глибокі drill-down ланцюжки.
        console.warn(
          `[DrillDownDrawer] stack exceeded max depth ${MAX_DEPTH}, dropping oldest entry`,
        );
        next.shift();
      }
      return next;
    });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
  }, []);

  const replaceTop = useCallback((entity: DrawerEntity) => {
    setStack((prev) => {
      if (prev.length === 0) {
        return [{ ...entity, uid: makeUid() }];
      }
      const last = prev[prev.length - 1];
      if (last.type === entity.type && last.id === entity.id) return prev;
      return [
        ...prev.slice(0, -1),
        { ...entity, uid: makeUid() },
      ];
    });
  }, []);

  const closeAll = useCallback(() => {
    setStack((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const setTopBreadcrumb = useCallback((label: string) => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.breadcrumbLabel === label) return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, breadcrumbLabel: label },
      ];
    });
  }, []);

  const value = useMemo<DrillDownContextValue>(
    () => ({ stack, open, back, replaceTop, closeAll, setTopBreadcrumb }),
    [stack, open, back, replaceTop, closeAll, setTopBreadcrumb],
  );

  return (
    <DrillDownContext.Provider value={value}>
      {children}
    </DrillDownContext.Provider>
  );
}

export const DRILL_DOWN_MAX_DEPTH = MAX_DEPTH;
