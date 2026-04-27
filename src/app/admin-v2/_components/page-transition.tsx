"use client";

import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Cinematic page transition for admin-v2:
 *  - Desktop: soft fade + slight rise (subtle, professional)
 *  - Mobile (pointer: coarse): iOS-style 3D rotateY + perspective slide
 *  - Reduced-motion: opacity only
 *
 * Triggered on every pathname change. Wraps children in AnimatePresence
 * with `mode="wait"` so old page exits cleanly before new one enters.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const isMobile = useIsCoarsePointer();

  const variants = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : isMobile
      ? {
          initial: { opacity: 0, x: 32, rotateY: 14, scale: 0.97 },
          animate: { opacity: 1, x: 0, rotateY: 0, scale: 1 },
          exit: { opacity: 0, x: -22, rotateY: -10, scale: 0.97 },
        }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -8 },
        };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={variants.initial}
        animate={variants.animate}
        exit={variants.exit}
        transition={{
          duration: reduce ? 0.18 : isMobile ? 0.55 : 0.42,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={
          isMobile
            ? { perspective: 1200, transformStyle: "preserve-3d" }
            : undefined
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoarse(mq.matches);
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return coarse;
}
