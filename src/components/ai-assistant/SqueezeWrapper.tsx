"use client";

import { useAiPanel } from "@/contexts/AiPanelContext";
import type { ReactNode } from "react";

export function SqueezeWrapper({ children }: { children: ReactNode }) {
  const { isOpen } = useAiPanel();

  return (
    <div
      className="transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] origin-left"
      style={{
        transform: isOpen ? "scale(0.92)" : "scale(1)",
        borderRadius: isOpen ? "16px" : "0px",
        overflow: isOpen ? "hidden" : undefined,
        height: isOpen ? "100vh" : undefined,
        boxShadow: isOpen ? "0 0 60px rgba(0,0,0,0.15)" : "none",
      }}
    >
      {children}
    </div>
  );
}
