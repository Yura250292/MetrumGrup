"use client";

import { type ReactNode } from "react";
import { LazyMotion, domAnimation } from "framer-motion";

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict={false}>
      {children}
    </LazyMotion>
  );
}
