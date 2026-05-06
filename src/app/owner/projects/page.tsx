import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getProjectsFinanceOverview } from "@/lib/owner/queries";
import { OwnerShell } from "../_components/owner-shell";
import { ProjectsRows } from "../_components/projects-rows";

export const dynamic = "force-dynamic";

export default async function OwnerProjectsPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const projects = await getProjectsFinanceOverview(firmId, { orderBy: "factExpense" });

  return (
    <OwnerShell title="Проекти" backHref="/owner" activeFirmId={firmId}>
      <div className="text-[11px] text-zinc-500 mb-3 px-1">
        {projects.length} {projects.length === 1 ? "проект" : "проектів"} · сортовано за фактичними витратами
      </div>
      <ProjectsRows projects={projects} />
    </OwnerShell>
  );
}
