"use client";

import type { Variants, Transition } from "framer-motion";
import { useReducedMotion } from "framer-motion";

// Bumped from {fast: 0.15, base: 0.22, slow: 0.32} on 2026-04-27 — user
// asked for smoother, slower animations. Keep tap/feedback under 0.3s
// so interactions still feel responsive; reveals/transitions can breathe.
export const MOTION_DURATION = {
  fast: 0.24,
  base: 0.4,
  slow: 0.55,
} as const;

export const MOTION_EASING = {
  // Soft cubic-bezier with a long tail — feels "expensive" / cinematic.
  softSpring: [0.16, 1, 0.3, 1] as [number, number, number, number],
  // Even gentler curve — used on entrances that should "float" in.
  cinema: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.cinema },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.cinema },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const dropdownEnter: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: -6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.cinema },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -2,
    transition: { duration: 0.18, ease: MOTION_EASING.inOut },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const tableRowEnter: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.cinema },
  },
};

export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: MOTION_EASING.cinema },
  },
};

export const heroStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.13,
      delayChildren: 0.1,
    },
  },
};

export const heroItem: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.78, ease: MOTION_EASING.cinema },
  },
};

export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: MOTION_EASING.cinema },
  },
};

export const gridStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.06,
    },
  },
};

export const pageTransitionVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASING.cinema },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const tapBounce = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: { duration: 0.24, ease: MOTION_EASING.softSpring },
};

export const layoutSpring: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 32,
  mass: 0.95,
};

// Softer spring for fly-in (longer overshoot tail, lower stiffness)
const flySpring: Transition = {
  type: "spring",
  stiffness: 140,
  damping: 22,
  mass: 1.1,
};

const flyExit: Transition = {
  duration: 0.65,
  ease: [0.7, 0, 0.84, 0],
};

export const flyInLeft: Variants = {
  hidden: { opacity: 0, x: -120, scale: 0.92, filter: "blur(8px)" },
  visible: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: flySpring },
  exit: { opacity: 0, x: 140, scale: 0.95, filter: "blur(8px)", transition: flyExit },
};

export const flyInRight: Variants = {
  hidden: { opacity: 0, x: 120, scale: 0.92, filter: "blur(8px)" },
  visible: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: flySpring },
  exit: { opacity: 0, x: -140, scale: 0.95, filter: "blur(8px)", transition: flyExit },
};

export const flyInUp: Variants = {
  hidden: { opacity: 0, y: 90, scale: 0.92, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: flySpring,
  },
  exit: {
    opacity: 0,
    y: -70,
    scale: 0.96,
    filter: "blur(6px)",
    transition: flyExit,
  },
};

/**
 * Cinematic drop-down: element falls from above with a soft bounce-in,
 * blurs slightly out of focus, then settles with a long-tailed spring.
 * Tuned 2026-04-27 to feel like a banner / tooltip / notification
 * descending into place — heavier than `flyInUp` (more mass, deeper drop,
 * stronger blur) so "приходить зверху" reads as deliberate.
 */
export const flyInDown: Variants = {
  hidden: {
    opacity: 0,
    y: -120,
    scale: 0.9,
    filter: "blur(10px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 110,
      damping: 18,
      mass: 1.25,
      // Stagger sub-properties so blur clears slightly after the drop lands —
      // creates a "rack-focus" cinematic moment instead of a single linear easing.
      opacity: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      filter: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: {
    opacity: 0,
    y: 80,
    scale: 0.94,
    filter: "blur(8px)",
    transition: {
      duration: 0.6,
      ease: [0.36, 0, 0.66, -0.56], // ease-in with slight anticipation
    },
  },
};

export const flyInScale: Variants = {
  hidden: { opacity: 0, scale: 0.5, filter: "blur(14px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 130,
      damping: 18,
      mass: 1.1,
      opacity: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
      filter: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: { opacity: 0, scale: 1.18, filter: "blur(12px)", transition: flyExit },
};

export const flyInTilt: Variants = {
  hidden: { opacity: 0, rotateX: 38, y: 90, scale: 0.82, filter: "blur(12px)" },
  visible: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 22,
      mass: 1.15,
      opacity: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
      filter: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: {
    opacity: 0,
    rotateX: -28,
    y: -70,
    scale: 0.9,
    filter: "blur(10px)",
    transition: flyExit,
  },
};

export function useReducedMotionVariants(variants: Variants): Variants {
  const reduce = useReducedMotion();
  if (!reduce) return variants;

  const stripped: Variants = {};
  for (const key of Object.keys(variants)) {
    const v = variants[key];
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      if ("opacity" in obj) next.opacity = obj.opacity;
      else next.opacity = 1;
      if ("transition" in obj) next.transition = obj.transition;
      stripped[key] = next as (typeof variants)[string];
    } else {
      stripped[key] = v;
    }
  }
  return stripped;
}
