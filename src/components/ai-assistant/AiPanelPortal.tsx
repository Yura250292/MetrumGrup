"use client";

import { createPortal } from "react-dom";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { AiChatPanel } from "./AiChatPanel";
import { AiTutorial } from "./AiTutorial";

export function AiPanelPortal() {
  const { isOpen, close, activeTutorial, closeTutorial } = useAiPanel();

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {isOpen && <AiChatPanel onClose={close} />}
      {activeTutorial && (
        <AiTutorial scenario={activeTutorial} onClose={closeTutorial} />
      )}
    </>,
    document.body,
  );
}
