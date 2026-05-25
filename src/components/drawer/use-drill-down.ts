"use client";

import { useContext } from "react";
import { DrillDownContext } from "./DrillDownDrawerProvider";

export function useDrillDown() {
  const ctx = useContext(DrillDownContext);
  if (!ctx) {
    throw new Error(
      "useDrillDown must be used inside <DrillDownDrawerProvider>",
    );
  }
  return ctx;
}
