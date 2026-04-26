"use client";

import dynamic from "next/dynamic";

// AI widget pulls in the assistant runtime (streaming, prompts, model
// config) — defer it from the dashboard initial bundle.
const AiDashboardWidget = dynamic(
  () => import("@/components/ai-assistant/AiDashboardWidget").then((m) => m.AiDashboardWidget),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 w-full animate-pulse rounded-xl bg-t-panel-soft" />
    ),
  },
);

export function AiDashboardWidgetWrapper() {
  return <AiDashboardWidget />;
}
