"use client";

import { cn } from "@/lib/utils";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/constants";
import { ProjectStage, StageStatus } from "@prisma/client";
import { Check } from "lucide-react";

interface ProjectProgressBarProps {
  currentStage: ProjectStage;
  stages: {
    stage: ProjectStage;
    status: StageStatus;
    progress: number;
  }[];
  compact?: boolean;
}

export function ProjectProgressBar({ currentStage, stages, compact = false }: ProjectProgressBarProps) {
  const stageMap = new Map(stages.map((s) => [s.stage, s]));

  return (
    <div className={cn("w-full", compact ? "py-2" : "py-4")}>
      {/* Desktop: horizontal stepper */}
      <div className={cn("hidden md:flex items-center", compact && "md:hidden")}>
        {STAGE_ORDER.map((stage, index) => {
          const record = stageMap.get(stage);
          const status = record?.status || "PENDING";
          const isCompleted = status === "COMPLETED";
          const isCurrent = stage === currentStage;
          const isLast = index === STAGE_ORDER.length - 1;

          return (
            <div key={stage} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all",
                    isCompleted && "bg-success text-success-foreground",
                    isCurrent && !isCompleted && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] text-center leading-tight max-w-[72px]",
                    isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {!isLast && (
                <div className="mx-1 h-0.5 flex-1">
                  <div
                    className={cn(
                      "h-full rounded-full transition-colors",
                      isCompleted ? "bg-success" : "bg-muted"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: compact bar */}
      <div className={cn("md:hidden", !compact && "md:hidden")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{STAGE_LABELS[currentStage]}</span>
          <span className="text-xs text-muted-foreground">
            {STAGE_ORDER.indexOf(currentStage) + 1} з {STAGE_ORDER.length}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{
              width: `${((STAGE_ORDER.indexOf(currentStage) + 1) / STAGE_ORDER.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Always show compact on compact mode for desktop too */}
      {compact && (
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">{STAGE_LABELS[currentStage]}</span>
            <span className="text-xs text-muted-foreground">
              {STAGE_ORDER.indexOf(currentStage) + 1}/{STAGE_ORDER.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${((STAGE_ORDER.indexOf(currentStage) + 1) / STAGE_ORDER.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
