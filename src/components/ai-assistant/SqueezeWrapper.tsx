"use client";

import { useAiPanel } from "@/contexts/AiPanelContext";
import type { ReactNode } from "react";

/**
 * When AI panel opens on desktop (md+), the main content area
 * gets a right margin so it reflows to fit beside the 440px panel.
 * On mobile the panel is fullscreen — no squeeze needed.
 */
export function SqueezeWrapper({ children }: { children: ReactNode }) {
  const { isOpen } = useAiPanel();

  return (
    <div
      className="min-h-screen transition-[margin-right] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{
        // Only squeeze on desktop (md: 768px+). On mobile panel is fullscreen overlay.
        marginRight: isOpen ? "var(--ai-panel-width, 0px)" : "0px",
      }}
    >
      {children}
    </div>
  );
}
