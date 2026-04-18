"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiChatPanel } from "./AiChatPanel";
import { AiAvatar } from "./AiAvatar";

export function AiChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isOpen ? T.accentPrimarySoft : T.panelElevated,
        }}
        title="AI Помічник"
      >
        <AiAvatar size="sm" animate={false} />
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
