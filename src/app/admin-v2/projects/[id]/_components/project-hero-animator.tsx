"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { heroStagger, heroItem, useReducedMotionVariants } from "@/lib/motion";

export function ProjectHeroAnimator({ children }: { children: ReactNode }) {
  const stagger = useReducedMotionVariants(heroStagger);
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      {children}
    </motion.div>
  );
}

export function ProjectHeroItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const item = useReducedMotionVariants(heroItem);
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
