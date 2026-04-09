"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, MessageCircle, MessageSquare, Clock } from "lucide-react";
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  STAGE_LABELS,
} from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import type { ProjectWithAggregations } from "@/hooks/useProjectAggregations";
import { TeamAvatarGroup } from "./TeamAvatarGroup";
import type { ProjectStatus, ProjectStage } from "@prisma/client";

export function AdminProjectCard({ project }: { project: ProjectWithAggregations }) {
  return (
    <Link href={`/admin/projects/${project.id}`}>
      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer mb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{project.title}</h3>
              <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus]}>
                {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
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
                  {STAGE_LABELS[project.currentStage as ProjectStage]}
                </span>
                <span className="text-xs font-medium">{project.stageProgress}%</span>
              </div>
              <Progress value={project.stageProgress} className="h-1.5" />
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCurrency(project.totalBudget)}</p>
              <p className="text-xs text-muted-foreground">
                Сплачено: {formatCurrency(project.totalPaid)}
              </p>
            </div>
            {project.startDate && (
              <div className="hidden lg:block text-xs text-muted-foreground">
                {formatDateShort(new Date(project.startDate))}
              </div>
            )}
          </div>
        </div>

        {/* Activity row */}
        <div className="mt-3 pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
          <TeamAvatarGroup users={project.team} max={5} size="md" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {project.unreadChatCount > 0 && (
              <span className="flex items-center gap-1 admin-dark:text-blue-400 admin-light:text-blue-600 font-semibold">
                <MessageSquare className="h-3.5 w-3.5" />
                {project.unreadChatCount}
                <span className="hidden sm:inline">непрочитаних</span>
              </span>
            )}
            {project.commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" />
                {project.commentCount}
                <span className="hidden sm:inline">коментарів</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {timeAgo(project.lastActivityAt)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
