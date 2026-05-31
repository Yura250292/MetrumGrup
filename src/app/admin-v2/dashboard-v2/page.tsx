import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * dashboard-v2.pen-derived widgets were merged into the canonical /admin-v2/
 * widget grid (см. WIDGET_REGISTRY: cashflow-chart, project-margin, today-live,
 * activity-timeline, margin-kpi-tile, live-workers-tile, deadline-watchlist).
 * Користувач відкриває /admin-v2/, додає їх через "Налаштувати дашборд".
 */
export default function DashboardV2Redirect() {
  redirect("/admin-v2");
}
