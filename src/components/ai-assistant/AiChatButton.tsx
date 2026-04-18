"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiChatPanel } from "./AiChatPanel";

export function AiChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isOpen ? T.accentPrimarySoft : T.panelElevated,
          color: isOpen ? T.accentPrimary : T.textSecondary,
        }}
        title="AI Помічник"
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <AiChatPanel onClose={() => setIsOpen(false)} />,
          document.body,
        )}
    </>
  );
}
