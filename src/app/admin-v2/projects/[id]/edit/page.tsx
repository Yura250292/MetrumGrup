import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { EditProjectForm } from "./_components/edit-project-form";

export const dynamic = "force-dynamic";

/**
 * Server shell для редагування проєкту. RBAC: SUPER_ADMIN/MANAGER
 * (співпадає з PATCH /api/admin/projects/[id]). Інші ролі — 404 через
 * notFound (щоб не розкривати існування).
 */
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    notFound();
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      code: true,
      type: true,
      description: true,
      address: true,
      status: true,
      totalBudget: true,
      startDate: true,
      expectedEndDate: true,
      coverImageUrl: true,
      isTestProject: true,
      firmId: true,
      manager: { select: { id: true, name: true } },
      clientName: true,
      clientCounterpartyId: true,
    },
  });
  if (!project) notFound();
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link
        href={`/admin-v2/projects/${id}`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-95"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} />
        {project.title}
      </Link>

      <section className="flex flex-col gap-2">
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          РЕДАГУВАННЯ
        </span>
        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          {project.title}
        </h1>
        <p className="text-[13px]" style={{ color: T.textSecondary }}>
          Базові поля проєкту. Етапи, команда, фото редагуються в окремих
          розділах.
        </p>
      </section>

      <EditProjectForm
        project={{
          id: project.id,
          title: project.title,
          code: project.code,
          type: project.type,
          description: project.description,
          address: project.address,
          status: project.status,
          totalBudget: Number(project.totalBudget),
          startDate: project.startDate,
          expectedEndDate: project.expectedEndDate,
          coverImageUrl: project.coverImageUrl,
          isTestProject: project.isTestProject,
          managerId: project.manager?.id ?? null,
          managerName: project.manager?.name ?? null,
        }}
      />
    </div>
  );
}
