"use client";

import {
  Children,
  type ReactNode,
  type ElementType,
  type CSSProperties,
} from "react";
import { motion } from "framer-motion";
import { gridStagger, flyInUp, useReducedMotionVariants } from "@/lib/motion";

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Cap how many items get the entrance animation (perf for huge lists). */
  animateMax?: number;
  /** Render container element. Defaults to `section`. */
  as?: "section" | "div" | "ul" | "ol";
}

export function StaggerList({
  children,
  className,
  style,
  animateMax = 20,
  as = "section",
}: StaggerListProps) {
  const containerVariants = useReducedMotionVariants(gridStagger);
  const itemVariants = useReducedMotionVariants(flyInUp);
  const items = Children.toArray(children);

  const Tag = motion[as] as ElementType;

  return (
    <Tag
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {items.map((child, i) =>
        i < animateMax ? (
          <motion.div key={i} variants={itemVariants}>
            {child}
          </motion.div>
        ) : (
          <div key={i}>{child}</div>
        ),
      )}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const item = useReducedMotionVariants(flyInUp);
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
