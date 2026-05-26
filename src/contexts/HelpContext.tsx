"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type HelpContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  activeFirmId: string | null;
};

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({
  children,
  activeFirmId,
}: {
  children: ReactNode;
  activeFirmId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<HelpContextValue>(
    () => ({ isOpen, open, close, activeFirmId }),
    [isOpen, open, close, activeFirmId],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used inside <HelpProvider>");
  return ctx;
}
