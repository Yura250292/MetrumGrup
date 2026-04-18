"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiAvatar } from "./AiAvatar";
import { useAiPanel } from "@/contexts/AiPanelContext";

export function AiChatButton() {
  const { isOpen, toggle } = useAiPanel();

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95 overflow-hidden"
      style={{
        backgroundColor: isOpen ? T.accentPrimarySoft : "transparent",
      }}
      title="AI Помічник"
    >
      <AiAvatar size="sm" />
    </button>
  );
}
