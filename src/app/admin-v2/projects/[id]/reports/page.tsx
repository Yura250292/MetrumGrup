import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ArrowLeft } from "lucide-react";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";
import { ReportsClient } from "./_components/reports-client";

export const dynamic = "force-dynamic";

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) notFound();

  if (!(await isTasksEnabledForProject(projectId))) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Модуль задач вимкнений — звіти по часу недоступні.
      </div>
    );
  }

  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTimeReports) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        У вас немає прав перегляду звітів по часу для цього проєкту.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin-v2/projects/${project.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До проєкту
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
          Звіти · {project.title}
        </h1>
      </header>
      <ReportsClient
        projectId={project.id}
        canViewCost={ctx.canViewCostReports}
      />
    </div>
  );
}
