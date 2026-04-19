"use client";

import { useCallback, useMemo } from "react";

const STORAGE_KEY = "metrum-glass-played";

export function useGlassBreak() {
  const shouldAnimate = useMemo(() => {
    if (typeof window === "undefined") return false;

    // Respect reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

    return !localStorage.getItem(STORAGE_KEY);
  }, []);

  const markPlayed = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage may be full or blocked — silently ignore
    }
  }, []);

  return { shouldAnimate, markPlayed };
}
