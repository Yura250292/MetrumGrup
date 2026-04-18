"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type AiPanelState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const AiPanelContext = createContext<AiPanelState>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <AiPanelContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  return useContext(AiPanelContext);
}
