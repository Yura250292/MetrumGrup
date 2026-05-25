"use client";

import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "metrum.drawer.width";
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 480;
const MAX_WIDTH = 720;

function initialWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (!Number.isNaN(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
      return saved;
    }
  } catch {
    // ignore privacy / quota errors
  }
  return DEFAULT_WIDTH;
}

/**
 * Drag-to-resize за лівою межею. Ширина зберігається у localStorage.
 * Витягнуто з ResizableDrawerWrapper (task-drawer-shared.tsx); зведено до
 * діапазону 480–720 (per roadmap-2026/00).
 */
export function useDrawerWidth() {
  const [width, setWidth] = useState<number>(initialWidth);
  const draggingRef = useRef(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, window.innerWidth - ev.clientX),
      );
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Persist only on release — уникнути спаму на mousemove.
      setWidth((curr) => {
        try {
          localStorage.setItem(STORAGE_KEY, String(curr));
        } catch {
          // ignore quota / privacy errors
        }
        return curr;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { width, startDrag, min: MIN_WIDTH, max: MAX_WIDTH };
}
