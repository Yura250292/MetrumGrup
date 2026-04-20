import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ProjectProgressBar } from "@/components/dashboard/ProjectProgressBar";
import { StageTimeline } from "@/components/dashboard/StageTimeline";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { PaymentScheduleTable } from "@/components/dashboard/PaymentScheduleTable";
import { OpenProjectChatButton } from "@/components/chat/OpenProjectChatButton";
import { CommentThread } from "@/components/collab/CommentThread";
import { ProjectEstimatesSection } from "@/components/projects/ProjectEstimatesSection";
import { ProjectFilesSection } from "@/components/projects/ProjectFilesSection";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  User,
  Camera,
  Plus,
  Settings,
} from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
      stages: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { scheduledDate: "asc" } },
      photoReports: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          images: { take: 1 },
          createdBy: { select: { name: true } },
        },
      },
      completionActs: { orderBy: { createdAt: "desc" } },
      _count: { select: { photoReports: true, files: true } },
    },
  });

  if (!project) notFound();

  return (
    <div>
      <Link
        href="/admin/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до проєктів
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.title}</h1>
            <Badge className={PROJECT_STATUS_COLORS[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {project.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {project.address}
              </span>
            )}
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" /> Клієнт: {project.client.name}
            </span>
            {project.manager && (
              <span>Менеджер: {project.manager.name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <OpenProjectChatButton projectId={id} />
          <Link href={`/admin/projects/${id}/photos/new`}>
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4" />
              Додати фото
            </Button>
          </Link>
          <Link href={`/admin/projects/${id}/stages`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
              Етапи
            </Button>
          </Link>
        </div>
      </div>

      {/* Progress */}
      <Card className="mb-6 p-5">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Прогрес проєкту ({project.stageProgress}%)
        </h2>
        <ProjectProgressBar
          currentStage={project.currentStage}
          currentStageRecordId={project.currentStageRecordId}
          stages={project.stages.map((s) => ({
            id: s.id,
            stage: s.stage,
            customName: s.customName,
            isHidden: s.isHidden,
            sortOrder: s.sortOrder,
            status: s.status,
            progress: s.progress,
          }))}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          {/* Stage Timeline */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Етапи</h2>
              <Link href={`/admin/projects/${id}/stages`}>
                <Button variant="ghost" size="sm">
                  Редагувати
                </Button>
              </Link>
            </div>
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

          {/* Photo Reports */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">
                Фотозвіти ({project._count.photoReports})
              </h2>
              <Link href={`/admin/projects/${id}/photos/new`}>
                <Button variant="ghost" size="sm">
                  <Plus className="h-4 w-4" />
                  Додати
                </Button>
              </Link>
            </div>
            {project.photoReports.length > 0 ? (
              <div className="space-y-3">
                {project.photoReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    {report.images[0] && (
                      <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                        <img
                          src={report.images[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(report.createdAt)} • {report.createdBy.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Немає фотозвітів
              </p>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Financial */}
          <FinancialSummary
            totalBudget={Number(project.totalBudget)}
            totalPaid={Number(project.totalPaid)}
          />

          {/* Payments */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Графік платежів</h2>
              <Link href={`/admin/projects/${id}/finances`}>
                <Button variant="ghost" size="sm">
                  Управління
                </Button>
              </Link>
            </div>
            <PaymentScheduleTable payments={project.payments} />
          </div>

          {/* Project Info */}
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Інформація</h2>
            <dl className="space-y-2 text-sm">
              {project.description && (
                <div>
                  <dt className="text-muted-foreground">Опис</dt>
                  <dd>{project.description}</dd>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {project.startDate && (
                  <div>
                    <dt className="text-muted-foreground">Початок</dt>
                    <dd className="font-medium">{formatDate(project.startDate)}</dd>
                  </div>
                )}
                {project.expectedEndDate && (
                  <div>
                    <dt className="text-muted-foreground">Планове завершення</dt>
                    <dd className="font-medium">{formatDate(project.expectedEndDate)}</dd>
                  </div>
                )}
              </div>
              <div>
                <dt className="text-muted-foreground">Контакт клієнта</dt>
                <dd>
                  {project.client.email}
                  {project.client.phone && ` • ${project.client.phone}`}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Estimates */}
      <div className="mt-6">
        <ProjectEstimatesSection projectId={project.id} />
      </div>

      {/* Project files */}
      <div className="mt-6">
        <ProjectFilesSection projectId={project.id} />
      </div>

      {/* Discussion */}
      <div className="mt-6">
        <CommentThread entityType="PROJECT" entityId={project.id} />
      </div>
    </div>
  );
}
