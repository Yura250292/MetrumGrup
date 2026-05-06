import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { ForemanShell } from "../../../_components/foreman-shell";
import { ReportInputForm } from "./_form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ForemanReportInputPage({ params }: PageProps) {
  const { projectId } = await params;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const projects = await getForemanProjects(userId, firmId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    redirect("/foreman/report/folder");
  }

  const backHref = project.folderId
    ? `/foreman/report/folder/${project.folderId}`
    : "/foreman/report/folder/none";

  return (
    <ForemanShell title={project.title} backHref={backHref}>
      <ReportInputForm projectId={project.id} projectTitle={project.title} />
    </ForemanShell>
  );
}
