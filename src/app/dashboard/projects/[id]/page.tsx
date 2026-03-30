import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { ProjectProgressBar } from "@/components/dashboard/ProjectProgressBar";
import { StageTimeline } from "@/components/dashboard/StageTimeline";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, MapPin, User, Camera, FileText, Wallet } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id,
      clientId: session.user.id,
    },
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
      payments: { orderBy: { scheduledDate: "asc" } },
      photoReports: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          images: { take: 1 },
          createdBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const recentPhotosCount = await prisma.photoReport.count({
    where: { projectId: id },
  });

  return (
    <div>
      {/* Back button */}
      <Link
        href="/dashboard/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до проєктів
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <Badge className={PROJECT_STATUS_COLORS[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </div>
        {project.address && (
          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {project.address}
          </div>
        )}
        {project.manager && (
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Менеджер: {project.manager.name}
            {project.manager.phone && ` • ${project.manager.phone}`}
          </div>
        )}
        {project.description && (
          <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* Progress Bar */}
      <Card className="mb-6 p-5">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Прогрес проєкту</h2>
        <ProjectProgressBar
          currentStage={project.currentStage}
          stages={project.stages.map((s) => ({
            stage: s.stage,
            status: s.status,
            progress: s.progress,
          }))}
        />
      </Card>

      {/* Quick links */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Link href={`/dashboard/projects/${id}/photos`}>
          <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
            <Camera className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-1.5 text-xs font-medium">Фотозвіти</p>
            <p className="text-[10px] text-muted-foreground">{recentPhotosCount} звітів</p>
          </Card>
        </Link>
        <Link href={`/dashboard/projects/${id}/finances`}>
          <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
            <Wallet className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-1.5 text-xs font-medium">Фінанси</p>
            <p className="text-[10px] text-muted-foreground">{project.payments.length} платежів</p>
          </Card>
        </Link>
        <Link href={`/dashboard/projects/${id}/documents`}>
          <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
            <FileText className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-1.5 text-xs font-medium">Документи</p>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stage Timeline */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Етапи будівництва</h2>
          <Card className="p-5">
            <StageTimeline
              stages={project.stages.map((s) => ({
                stage: s.stage,
                status: s.status,
                progress: s.progress,
                startDate: s.startDate,
                endDate: s.endDate,
                notes: s.notes,
              }))}
            />
          </Card>
        </div>

        {/* Financial Summary */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Фінанси</h2>
          <FinancialSummary
            totalBudget={Number(project.totalBudget)}
            totalPaid={Number(project.totalPaid)}
          />
        </div>
      </div>

      {/* Project dates */}
      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Дати проєкту</h2>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          {project.startDate && (
            <div>
              <span className="text-muted-foreground">Початок:</span>{" "}
              <span className="font-medium">{formatDate(project.startDate)}</span>
            </div>
          )}
          {project.expectedEndDate && (
            <div>
              <span className="text-muted-foreground">Планове завершення:</span>{" "}
              <span className="font-medium">{formatDate(project.expectedEndDate)}</span>
            </div>
          )}
          {project.actualEndDate && (
            <div>
              <span className="text-muted-foreground">Фактичне завершення:</span>{" "}
              <span className="font-medium">{formatDate(project.actualEndDate)}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
