"use client";

import { createPortal } from "react-dom";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { AiChatPanel } from "./AiChatPanel";

export function AiPanelPortal() {
  const { isOpen, close } = useAiPanel();

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(<AiChatPanel onClose={close} />, document.body);
}
