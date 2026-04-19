"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { loadWidgetConfig, WidgetConfig, type WidgetId } from "./widget-config";

const WidgetVisibilityContext = createContext<Set<WidgetId>>(new Set());

export function useWidgetVisibility() {
  return useContext(WidgetVisibilityContext);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => loadWidgetConfig());

  return (
    <WidgetVisibilityContext.Provider value={visible}>
      <WidgetConfig visible={visible} onChange={setVisible} />
      {children}
    </WidgetVisibilityContext.Provider>
  );
}

export function Widget({ id, children }: { id: WidgetId; children: ReactNode }) {
  const visible = useContext(WidgetVisibilityContext);
  if (!visible.has(id)) return null;
  return <>{children}</>;
}
