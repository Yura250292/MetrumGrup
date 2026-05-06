import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getDashboardKpis, getProjectsFinanceOverview } from "@/lib/owner/queries";
import { OwnerShell } from "./_components/owner-shell";
import { KpiGrid } from "./_components/kpi-grid";
import { ProjectsRows } from "./_components/projects-rows";
import { OwnerHomeActions } from "./_components/home-actions";
import { CollapsibleSection } from "./_components/collapsible-section";

export const dynamic = "force-dynamic";

export default async function OwnerHomePage() {
  const session = await auth();
  const userName = session?.user?.name?.split(" ")[0] ?? "Власник";
  const { firmId } = await resolveFirmScopeForRequest(session);

  const [kpis, projects] = await Promise.all([
    getDashboardKpis(firmId),
    getProjectsFinanceOverview(firmId, { limit: 5, orderBy: "factExpense" }),
  ]);

  return (
    <OwnerShell isRoot showLogout activeFirmId={firmId}>
      <div className="space-y-5 mt-1">
        {/* Identity strip */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-white">{userName}</span>
          <span className="text-xs text-zinc-500">· Дашборд директора</span>
        </div>

        <KpiGrid kpis={kpis} />

        <OwnerHomeActions />

        {/* Top projects by spend — collapsible */}
        <CollapsibleSection
          title="Топ проекти за витратами"
          caption={`${projects.length}`}
          href="/owner/projects"
          defaultOpen
        >
          <ProjectsRows projects={projects} />
        </CollapsibleSection>
      </div>
    </OwnerShell>
  );
}
