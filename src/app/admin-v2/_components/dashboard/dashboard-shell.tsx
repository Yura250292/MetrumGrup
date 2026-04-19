"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { loadWidgetConfig, WidgetConfig, type WidgetId } from "./widget-config";

const WidgetVisibilityContext = createContext<Set<WidgetId>>(new Set());
const WidgetOnChangeContext = createContext<(next: Set<WidgetId>) => void>(() => {});

export function useWidgetVisibility() {
  return useContext(WidgetVisibilityContext);
}

export function useWidgetOnChange() {
  return useContext(WidgetOnChangeContext);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => loadWidgetConfig());

  return (
    <WidgetVisibilityContext.Provider value={visible}>
      <WidgetOnChangeContext.Provider value={setVisible}>
        {children}
      </WidgetOnChangeContext.Provider>
    </WidgetVisibilityContext.Provider>
  );
}

/** Standalone config button — place anywhere inside DashboardShell */
export function DashboardWidgetConfigButton() {
  const visible = useWidgetVisibility();
  const onChange = useWidgetOnChange();
  return <WidgetConfig visible={visible} onChange={onChange} />;
}

export function Widget({ id, children }: { id: WidgetId; children: ReactNode }) {
  const visible = useContext(WidgetVisibilityContext);
  if (!visible.has(id)) return null;
  return <>{children}</>;
}
