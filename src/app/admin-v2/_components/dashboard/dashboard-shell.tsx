"use client";

import { useState, type ReactNode } from "react";
import { loadWidgetConfig, WidgetConfig, type WidgetId } from "./widget-config";

export function DashboardShell({
  children,
}: {
  children: (visible: Set<WidgetId>) => ReactNode;
}) {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => loadWidgetConfig());

  return (
    <>
      <WidgetConfig visible={visible} onChange={setVisible} />
      {children(visible)}
    </>
  );
}
