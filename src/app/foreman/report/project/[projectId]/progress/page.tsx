import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanAccessibleProjects } from "@/lib/auth-utils";
import { LightShell } from "../../../../_components/v2/light-shell";
import { ProgressReportForm } from "./_progress-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ForemanProgressReportPage({ params }: PageProps) {
  const { projectId } = await params;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const projects = await getForemanAccessibleProjects(userId, firmId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    redirect("/foreman/report/folder");
  }

  const backHref = `/foreman/report/project/${project.id}`;

  return (
    <LightShell title={`Звіт: ${project.title}`} backHref={backHref} hideBottomNav>
      <ProgressReportForm projectId={project.id} />
    </LightShell>
  );
}
