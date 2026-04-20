"use client";

import { cn } from "@/lib/utils";
import { stageDisplayName } from "@/lib/constants";
import { ProjectStage, StageStatus } from "@prisma/client";
import { Check } from "lucide-react";

export type ProgressBarStage = {
  id: string;
  stage: ProjectStage | null;
  customName: string | null;
  status: StageStatus;
  progress: number;
  isHidden?: boolean;
  sortOrder?: number;
};

interface ProjectProgressBarProps {
  currentStage: ProjectStage;
  currentStageRecordId?: string | null;
  stages: ProgressBarStage[];
  compact?: boolean;
}

export function ProjectProgressBar({
  currentStage,
  currentStageRecordId,
  stages,
  compact = false,
}: ProjectProgressBarProps) {
  const visible = [...stages]
    .filter((s) => !s.isHidden)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (visible.length === 0) {
    return null;
  }

  // Prefer currentStageRecordId (per-project override) when provided; else fall back to enum match.
  let currentIndex = currentStageRecordId
    ? visible.findIndex((s) => s.id === currentStageRecordId)
    : -1;
  if (currentIndex < 0) {
    currentIndex = visible.findIndex((s) => s.stage === currentStage);
  }
  if (currentIndex < 0) currentIndex = 0;

  const currentRecord = visible[currentIndex];
  const currentLabel = currentRecord ? stageDisplayName(currentRecord) : "—";

  return (
    <div className={cn("w-full", compact ? "py-2" : "py-4")}>
      {/* Desktop: horizontal stepper */}
      <div className={cn("hidden md:flex items-center", compact && "md:hidden")}>
        {visible.map((record, index) => {
          const isCompleted = record.status === "COMPLETED";
          const isCurrent = index === currentIndex;
          const isLast = index === visible.length - 1;

          return (
            <div key={record.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all",
                    isCompleted && "bg-success text-success-foreground",
                    isCurrent &&
                      !isCompleted &&
                      "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !isCompleted &&
                      !isCurrent &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] text-center leading-tight max-w-[80px] line-clamp-2 break-words",
                    isCurrent
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {stageDisplayName(record)}
                </span>
              </div>
              {!isLast && (
                <div className="mx-1 h-0.5 flex-1">
                  <div
                    className={cn(
                      "h-full rounded-full transition-colors",
                      isCompleted ? "bg-success" : "bg-muted",
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
          <span className="text-sm font-medium">{currentLabel}</span>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} з {visible.length}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{
              width: `${((currentIndex + 1) / visible.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Always show compact on compact mode for desktop too */}
      {compact && (
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">{currentLabel}</span>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1}/{visible.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${((currentIndex + 1) / visible.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
