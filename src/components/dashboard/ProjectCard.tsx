import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { ProjectWithStages } from "@/types";
import { MapPin, Calendar, Wallet, ArrowUpRight } from "lucide-react";

interface ProjectCardProps {
  project: ProjectWithStages;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const remaining = Number(project.totalBudget) - Number(project.totalPaid);

  return (
    <Link href={`/dashboard/projects/${project.id}`}>
      <Card className="group p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
              {project.title}
            </h3>
            {project.address && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{project.address}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={PROJECT_STATUS_COLORS[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
          </div>
        </div>

        <div className="mt-5">
          <ProjectProgressBar
            currentStage={project.currentStage}
            stages={project.stages.map((s) => ({
              stage: s.stage,
              status: s.status,
              progress: s.progress,
            }))}
            compact
          />
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          {project.startDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDateShort(project.startDate)}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            <span>Залишок: <span className="font-medium text-foreground">{formatCurrency(remaining)}</span></span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
