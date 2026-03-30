import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, STAGE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      client: { select: { name: true } },
      manager: { select: { name: true } },
      stages: { where: { status: "COMPLETED" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Проєкти</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} проєктів загалом
          </p>
        </div>
        <Link href="/admin/projects/new">
          <Button>
            <Plus className="h-4 w-4" />
            Новий проєкт
          </Button>
        </Link>
      </div>

      {projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/admin/projects/${project.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer mb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{project.title}</h3>
                      <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Клієнт: {project.client.name}</span>
                      {project.manager && <span>Менеджер: {project.manager.name}</span>}
                      {project.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {project.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="min-w-[120px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {STAGE_LABELS[project.currentStage]}
                        </span>
                        <span className="text-xs font-medium">{project.stageProgress}%</span>
                      </div>
                      <Progress value={project.stageProgress} className="h-1.5" />
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(Number(project.totalBudget))}</p>
                      <p className="text-xs text-muted-foreground">
                        Сплачено: {formatCurrency(Number(project.totalPaid))}
                      </p>
                    </div>
                    {project.startDate && (
                      <div className="hidden lg:block text-xs text-muted-foreground">
                        {formatDateShort(project.startDate)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Немає проєктів</p>
        </Card>
      )}
    </div>
  );
}
