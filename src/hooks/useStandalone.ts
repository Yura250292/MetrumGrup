"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether the app is running in PWA standalone mode
 * (installed to home screen / launched from app icon).
 *
 * Returns false on SSR to keep markup deterministic; flips to the
 * real value after mount and updates if display-mode changes.
 */
export function useStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(display-mode: standalone)");
    const iosStandalone =
      "standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsStandalone(mq.matches || iosStandalone);

    const onChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isStandalone;
}
