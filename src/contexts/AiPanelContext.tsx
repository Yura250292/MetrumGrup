"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { TutorialScenario } from "@/components/ai-assistant/AiTutorial";

export type AnimationPhase = "idle" | "asking" | "breaking" | "done";

type AiPanelState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  animationPhase: AnimationPhase;
  setAnimationPhase: (phase: AnimationPhase) => void;
  completeAnimation: () => void;
  activeTutorial: TutorialScenario | null;
  startTutorial: (scenario: TutorialScenario) => void;
  closeTutorial: () => void;
};

const AiPanelContext = createContext<AiPanelState>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  animationPhase: "idle",
  setAnimationPhase: () => {},
  completeAnimation: () => {},
  activeTutorial: null,
  startTutorial: () => {},
  closeTutorial: () => {},
});

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [activeTutorial, setActiveTutorial] = useState<TutorialScenario | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setAnimationPhase("idle");
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const completeAnimation = useCallback(() => setAnimationPhase("done"), []);

  const startTutorial = useCallback((scenario: TutorialScenario) => {
    setIsOpen(false); // close AI panel
    // Delay to let panel animate out before tutorial overlay appears
    setTimeout(() => setActiveTutorial(scenario), 500);
  }, []);

  const closeTutorial = useCallback(() => setActiveTutorial(null), []);

  return (
    <AiPanelContext.Provider
      value={{ isOpen, open, close, toggle, animationPhase, setAnimationPhase, completeAnimation, activeTutorial, startTutorial, closeTutorial }}
    >
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  return useContext(AiPanelContext);
}
