"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { DashboardLayout, WidgetType } from "./layout-schema";
import { useDashboardLayout } from "./use-dashboard-layout";
import { WidgetConfigButton } from "./widget-config";

type DashboardLayoutContextValue = {
  layout: DashboardLayout;
  isEditing: boolean;
  setEditing: (v: boolean) => void;
  updateLayout: (next: DashboardLayout) => void;
  isSaving: boolean;
  hasWidget: (type: WidgetType) => boolean;
};

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | null>(null);

export function useDashboardLayoutContext(): DashboardLayoutContextValue {
  const ctx = useContext(DashboardLayoutContext);
  if (!ctx) {
    throw new Error("useDashboardLayoutContext must be used inside <DashboardShell>");
  }
  return ctx;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { layout, save } = useDashboardLayout();
  const [isEditing, setEditing] = useState(false);

  const updateLayout = useCallback(
    (next: DashboardLayout) => {
      save.commit(next);
    },
    [save],
  );

  const hasWidget = useCallback(
    (type: WidgetType) => layout.desktop.widgets.some((w) => w.type === type),
    [layout.desktop.widgets],
  );

  const value: DashboardLayoutContextValue = {
    layout,
    isEditing,
    setEditing,
    updateLayout,
    isSaving: save.isSaving,
    hasWidget,
  };

  return (
    <DashboardLayoutContext.Provider value={value}>
      {children}
    </DashboardLayoutContext.Provider>
  );
}

/**
 * Edit-mode toggle button — place it in the dashboard header.
 * Re-exports WidgetConfigButton under the existing name used by the page.
 */
export function DashboardWidgetConfigButton() {
  return <WidgetConfigButton />;
}

/**
 * Conditional widget renderer. Kept for backwards compatibility with
 * existing page.tsx layout, where individual widgets were wrapped in <Widget id=...>.
 * After migration to <DashboardGrid />, this is a no-op passthrough —
 * the grid itself controls visibility via the layout object.
 *
 * While the old full-layout JSX still exists alongside the grid (during migration),
 * this returns null so that server-rendered widgets only show up through the grid's
 * slot map.
 */
export function Widget({ id: _id, children: _children }: { id: string; children: ReactNode }) {
  return null;
}
