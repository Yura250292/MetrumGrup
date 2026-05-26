"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { HelpTour } from "@/lib/help/types";
import { markTourCompleted } from "@/lib/help/storage";
import { trackHelpEvent } from "@/lib/help/analytics";

type HelpContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  activeFirmId: string | null;
  activeTour: HelpTour | null;
  startTour: (tour: HelpTour, opts?: { route?: string; role?: string | null }) => void;
  endTour: (completed: boolean, opts?: { route?: string; role?: string | null }) => void;
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
  const [activeTour, setActiveTour] = useState<HelpTour | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const startTour = useCallback<HelpContextValue["startTour"]>((tour, opts) => {
    setIsOpen(false);
    setActiveTour(tour);
    trackHelpEvent("help_tour_started", { tourId: tour.id, route: opts?.route, role: opts?.role });
  }, []);

  const endTour = useCallback<HelpContextValue["endTour"]>((completed, opts) => {
    setActiveTour((cur) => {
      if (cur && completed) {
        markTourCompleted(cur.id, cur.version);
        trackHelpEvent("help_tour_completed", { tourId: cur.id, route: opts?.route, role: opts?.role });
      }
      return null;
    });
  }, []);

  const value = useMemo<HelpContextValue>(
    () => ({ isOpen, open, close, activeFirmId, activeTour, startTour, endTour }),
    [isOpen, open, close, activeFirmId, activeTour, startTour, endTour],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used inside <HelpProvider>");
  return ctx;
}
