"use client";

import { motion } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";

/**
 * Thin client-side wrapper that adds mount fade-in + hover lift to a
 * card-shaped child. Lets the parent (e.g. KpiCard) stay a Server
 * Component so it can keep receiving forwardRef'd lucide icon
 * components across the server→client boundary.
 */
export function MotionCard({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98, y: 0 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
