"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "metrum-glass-played";

export function useGlassBreak() {
  const [played, setPlayed] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    return !!localStorage.getItem(STORAGE_KEY);
  });

  const shouldAnimate = !played;

  const markPlayed = useCallback(() => {
    setPlayed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage may be full or blocked
    }
  }, []);

  return { shouldAnimate, markPlayed };
}
