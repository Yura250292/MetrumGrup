"use client";

import { ReactNode } from "react";
import { motion } from "@/components/motion/motion";
import {
  flyInLeft,
  flyInRight,
  flyInUp,
  flyInDown,
  flyInScale,
  flyInTilt,
} from "@/lib/motion";

type FlyDirection = "left" | "right" | "up" | "down" | "scale" | "tilt";

const variantsMap = {
  left: flyInLeft,
  right: flyInRight,
  up: flyInUp,
  down: flyInDown,
  scale: flyInScale,
  tilt: flyInTilt,
};

interface FlyInProps {
  from?: FlyDirection;
  delay?: number;
  once?: boolean;
  whileInView?: boolean;
  className?: string;
  children: ReactNode;
}

export function FlyIn({
  from = "up",
  delay = 0,
  once = true,
  whileInView = false,
  className,
  children,
}: FlyInProps) {
  const variants = variantsMap[from];

  if (whileInView) {
    return (
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once, amount: 0.25 }}
        variants={variants}
        transition={{ delay }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
