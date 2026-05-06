import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../../../../../_components/foreman-shell";
import { ReviewForm } from "./_form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string; reportId: string }>;
}

export default async function ForemanReviewPage({ params }: PageProps) {
  const { projectId, reportId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { firmId } = await resolveFirmScopeForRequest(session);

  const report = await prisma.foremanReport.findFirst({
    where: {
      id: reportId,
      projectId,
      createdById: session.user.id,
      firmId: firmId ?? undefined,
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      project: { select: { id: true, title: true, folderId: true } },
    },
  });

  if (!report) notFound();

  // Якщо вже submitted — кидаємо до history
  if (report.status !== "DRAFT") {
    redirect("/foreman/history");
  }

  return (
    <ForemanShell title="Перевірте звіт" backHref={`/foreman/report/project/${projectId}`}>
      <ReviewForm
        reportId={report.id}
        projectId={report.project.id}
        projectTitle={report.project.title}
        initialItems={report.items.map((i) => ({
          id: i.id,
          costType: i.costType,
          title: i.title,
          unit: i.unit,
          quantity: i.quantity?.toString() ?? null,
          unitPrice: i.unitPrice?.toString() ?? null,
          amount: i.amount.toString(),
          currency: i.currency,
          confidence: i.confidence,
        }))}
      />
    </ForemanShell>
  );
}
