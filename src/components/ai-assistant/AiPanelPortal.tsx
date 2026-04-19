"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAiPanel } from "@/contexts/AiPanelContext";
import { useTheme } from "@/contexts/ThemeContext";
import { AiChatPanel } from "./AiChatPanel";
import { AiTutorial } from "./AiTutorial";
import { GlassBreakOverlay } from "./GlassBreakOverlay";
import { ShivaPrompt } from "./ShivaPrompt";
import { useGlassBreak } from "./useGlassBreak";

export function AiPanelPortal() {
  const { isOpen, close, animationPhase, setAnimationPhase, completeAnimation, activeTutorial, closeTutorial } = useAiPanel();
  const { theme } = useTheme();
  const { shouldAnimate, markPlayed } = useGlassBreak();
  const prevOpen = useRef(false);

  // Determine animation phase when panel opens
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      if (shouldAnimate) {
        setAnimationPhase("asking");
      } else {
        setAnimationPhase("done");
      }
    }
    prevOpen.current = isOpen;
  }, [isOpen, shouldAnimate, setAnimationPhase]);

  if (typeof document === "undefined") return null;

  const hasContent = isOpen || activeTutorial;
  if (!hasContent) return null;

  return createPortal(
    <div className={theme === "dark" ? "admin-dark" : "admin-light"}>
      {/* Chat panel — only when animation is done or skipped */}
      {isOpen && animationPhase === "done" && <AiChatPanel onClose={close} />}

      {/* Prompt: "Хочеш розбити шибу?" */}
      {isOpen && animationPhase === "asking" && (
        <ShivaPrompt
          onYes={() => setAnimationPhase("breaking")}
          onNo={() => {
            markPlayed();
            completeAnimation();
          }}
        />
      )}

      {/* Glass break animation */}
      {isOpen && animationPhase === "breaking" && (
        <GlassBreakOverlay
          onComplete={() => {
            completeAnimation();
            markPlayed();
          }}
        />
      )}

      {activeTutorial && (
        <AiTutorial scenario={activeTutorial} onClose={closeTutorial} />
      )}
    </div>,
    document.body,
  );
}
