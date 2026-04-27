"use client";

import { motion } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";
import { MOTION_EASING } from "@/lib/motion";

export function MotionCard({
  className,
  style,
  children,
  delay = 0,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.42,
        delay,
        ease: MOTION_EASING.softSpring,
      }}
      whileHover={{ y: -3, scale: 1.012 }}
      whileTap={{ scale: 0.98, y: 0 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
