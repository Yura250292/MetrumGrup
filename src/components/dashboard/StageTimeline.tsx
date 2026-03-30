import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { STAGE_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { ProjectStage, StageStatus } from "@prisma/client";
import { Check, Clock, Circle } from "lucide-react";

interface StageTimelineProps {
  stages: {
    stage: ProjectStage;
    status: StageStatus;
    progress: number;
    startDate: Date | string | null;
    endDate: Date | string | null;
    notes: string | null;
  }[];
}

const statusIcons = {
  COMPLETED: Check,
  IN_PROGRESS: Clock,
  PENDING: Circle,
};

export function StageTimeline({ stages }: StageTimelineProps) {
  return (
    <div className="space-y-0">
      {stages.map((stage, index) => {
        const Icon = statusIcons[stage.status];
        const isLast = index === stages.length - 1;

        return (
          <div key={stage.stage} className="flex gap-4">
            {/* Timeline line + icon */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  stage.status === "COMPLETED" && "bg-success text-success-foreground",
                  stage.status === "IN_PROGRESS" && "bg-primary text-primary-foreground",
                  stage.status === "PENDING" && "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[2rem]",
                    stage.status === "COMPLETED" ? "bg-success" : "bg-muted"
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className={cn("pb-6 flex-1", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <h4 className={cn(
                  "text-sm font-medium",
                  stage.status === "PENDING" && "text-muted-foreground"
                )}>
                  {STAGE_LABELS[stage.stage]}
                </h4>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full",
                    stage.status === "COMPLETED" && "bg-green-100 text-green-700",
                    stage.status === "IN_PROGRESS" && "bg-blue-100 text-blue-700",
                    stage.status === "PENDING" && "bg-gray-100 text-gray-500"
                  )}
                >
                  {STAGE_STATUS_LABELS[stage.status]}
                </span>
              </div>

              {/* Dates */}
              <div className="mt-1 text-xs text-muted-foreground">
                {stage.startDate && (
                  <span>
                    {formatDate(stage.startDate)}
                    {stage.endDate && ` — ${formatDate(stage.endDate)}`}
                  </span>
                )}
              </div>

              {/* Progress bar for in-progress */}
              {stage.status === "IN_PROGRESS" && stage.progress > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Прогрес</span>
                    <span className="text-xs font-medium">{stage.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              {stage.notes && (
                <p className="mt-1.5 text-xs text-muted-foreground">{stage.notes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
