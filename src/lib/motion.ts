"use client";

import type { Variants, Transition } from "framer-motion";
import { useReducedMotion } from "framer-motion";

export const MOTION_DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

export const MOTION_EASING = {
  softSpring: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.softSpring },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.softSpring },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const dropdownEnter: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.softSpring },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -2,
    transition: { duration: 0.12, ease: MOTION_EASING.inOut },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const tableRowEnter: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.softSpring },
  },
};

export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: MOTION_EASING.softSpring },
  },
};

export const heroStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.06,
    },
  },
};

export const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: MOTION_EASING.softSpring },
  },
};

export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: MOTION_EASING.softSpring },
  },
};

export const gridStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
};

export const pageTransitionVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASING.softSpring },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.inOut },
  },
};

export const tapBounce = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: { duration: 0.18, ease: MOTION_EASING.softSpring },
};

export const layoutSpring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.8,
};

const flySpring: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 22,
  mass: 0.9,
};

const flyExit: Transition = {
  duration: 0.45,
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
  hidden: { opacity: 0, y: 80, scale: 0.94, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: flySpring },
  exit: { opacity: 0, y: -60, scale: 0.96, filter: "blur(6px)", transition: flyExit },
};

export const flyInDown: Variants = {
  hidden: { opacity: 0, y: -80, scale: 0.94, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: flySpring },
  exit: { opacity: 0, y: 60, scale: 0.96, filter: "blur(6px)", transition: flyExit },
};

export const flyInScale: Variants = {
  hidden: { opacity: 0, scale: 0.55, filter: "blur(12px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 180, damping: 16, mass: 1 },
  },
  exit: { opacity: 0, scale: 1.15, filter: "blur(10px)", transition: flyExit },
};

export const flyInTilt: Variants = {
  hidden: { opacity: 0, rotateX: 35, y: 80, scale: 0.85, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 180, damping: 20, mass: 1 },
  },
  exit: { opacity: 0, rotateX: -25, y: -60, scale: 0.9, filter: "blur(10px)", transition: flyExit },
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
