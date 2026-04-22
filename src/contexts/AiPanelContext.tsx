"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TutorialScenario } from "@/components/ai-assistant/AiTutorial";

export type AnimationPhase = "idle" | "asking" | "breaking" | "done";

type AiPanelState = {
  isOpen: boolean;
  open: (initialPrompt?: string) => void;
  close: () => void;
  toggle: () => void;
  animationPhase: AnimationPhase;
  setAnimationPhase: (phase: AnimationPhase) => void;
  completeAnimation: () => void;
  activeTutorial: TutorialScenario | null;
  startTutorial: (scenario: TutorialScenario) => void;
  closeTutorial: () => void;
  consumePendingPrompt: () => string | null;
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
  consumePendingPrompt: () => null,
});

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [activeTutorial, setActiveTutorial] = useState<TutorialScenario | null>(null);
  const pendingPromptRef = useRef<string | null>(null);

  const open = useCallback((initialPrompt?: string) => {
    if (initialPrompt) pendingPromptRef.current = initialPrompt;
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setAnimationPhase("idle");
    pendingPromptRef.current = null;
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const completeAnimation = useCallback(() => setAnimationPhase("done"), []);

  const startTutorial = useCallback((scenario: TutorialScenario) => {
    setIsOpen(false); // close AI panel
    // Delay to let panel animate out before tutorial overlay appears
    setTimeout(() => setActiveTutorial(scenario), 500);
  }, []);

  const closeTutorial = useCallback(() => setActiveTutorial(null), []);

  const consumePendingPrompt = useCallback(() => {
    const p = pendingPromptRef.current;
    pendingPromptRef.current = null;
    return p;
  }, []);

  return (
    <AiPanelContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        animationPhase,
        setAnimationPhase,
        completeAnimation,
        activeTutorial,
        startTutorial,
        closeTutorial,
        consumePendingPrompt,
      }}
    >
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  return useContext(AiPanelContext);
}
