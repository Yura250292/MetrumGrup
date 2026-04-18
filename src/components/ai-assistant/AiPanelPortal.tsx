"use client";

import { createPortal } from "react-dom";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { useTheme } from "@/contexts/ThemeContext";
import { AiChatPanel } from "./AiChatPanel";
import { AiTutorial } from "./AiTutorial";

export function AiPanelPortal() {
  const { isOpen, close, activeTutorial, closeTutorial } = useAiPanel();
  const { theme } = useTheme();

  if (typeof document === "undefined") return null;

  const hasContent = isOpen || activeTutorial;
  if (!hasContent) return null;

  return createPortal(
    <div className={theme === "dark" ? "admin-dark" : "admin-light"}>
      {isOpen && <AiChatPanel onClose={close} />}
      {activeTutorial && (
        <AiTutorial scenario={activeTutorial} onClose={closeTutorial} />
      )}
    </div>,
    document.body,
  );
}
