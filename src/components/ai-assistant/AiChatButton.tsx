"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiAvatar } from "./AiAvatar";
import { useAiPanel } from "@/contexts/AiPanelContext";

export function AiChatButton() {
  const { isOpen, toggle } = useAiPanel();

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
      style={{
        backgroundColor: isOpen ? T.accentPrimarySoft : T.panelElevated,
      }}
      title="AI Помічник"
    >
      <AiAvatar size="sm" />
    </button>
  );
}
