"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { TutorialScenario } from "@/components/ai-assistant/AiTutorial";

type AiPanelState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  activeTutorial: TutorialScenario | null;
  startTutorial: (scenario: TutorialScenario) => void;
  closeTutorial: () => void;
};

const AiPanelContext = createContext<AiPanelState>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  activeTutorial: null,
  startTutorial: () => {},
  closeTutorial: () => {},
});

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<TutorialScenario | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const startTutorial = useCallback((scenario: TutorialScenario) => {
    setIsOpen(false); // close AI panel
    // Delay to let panel animate out before tutorial overlay appears
    setTimeout(() => setActiveTutorial(scenario), 500);
  }, []);

  const closeTutorial = useCallback(() => setActiveTutorial(null), []);

  return (
    <AiPanelContext.Provider
      value={{ isOpen, open, close, toggle, activeTutorial, startTutorial, closeTutorial }}
    >
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  return useContext(AiPanelContext);
}
