import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import { AlertTriangle, Clock } from "lucide-react";

type StageAvg = {
  stage: ProjectStage;
  avgDays: number;
  count: number;
};

const STAGE_ORDER: ProjectStage[] = [
  "DESIGN",
  "FOUNDATION",
  "WALLS",
  "ROOF",
  "ENGINEERING",
  "FINISHING",
  "HANDOVER",
];

const STAGE_COLORS: Record<string, string> = {
  DESIGN: "#7C3AED",
  FOUNDATION: "#0284C7",
  WALLS: "#3B5BFF",
  ROOF: "#0D9488",
  ENGINEERING: "#D97706",
  FINISHING: "#4F46E5",
  HANDOVER: "#059669",
};

export function StageAnalytics({
  stageMap,
  activeProjectsCount,
  stageAverages,
}: {
  stageMap: Map<ProjectStage, number>;
  activeProjectsCount: number;
  stageAverages: StageAvg[];
}) {
  const stageMax = Math.max(...Array.from(stageMap.values()), 1);

  // Find bottleneck — stage with most projects
  let bottleneckStage: ProjectStage | null = null;
  let bottleneckCount = 0;
  for (const stage of STAGE_ORDER) {
    const count = stageMap.get(stage) ?? 0;
    if (count > bottleneckCount) {
      bottleneckCount = count;
      bottleneckStage = stage;
    }
  }

  // Find slowest stage
  const avgMap = new Map(stageAverages.map((s) => [s.stage, s]));
  let slowestStage: StageAvg | null = null;
  for (const avg of stageAverages) {
    if (!slowestStage || avg.avgDays > slowestStage.avgDays) {
      slowestStage = avg;
    }
  }

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПОТОК РОБОТИ
          </span>
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Розподіл та аналітика етапів
          </h2>
        </div>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          разом {activeProjectsCount}
        </span>
      </div>

      {activeProjectsCount === 0 ? (
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          Немає активних проєктів
        </p>
      ) : (
        <>
          {/* Stage distribution bars */}
          <div className="flex flex-col gap-2 mb-4">
            {STAGE_ORDER.map((stage) => {
              const count = stageMap.get(stage) ?? 0;
              const pct = (count / stageMax) * 100;
              const barColor = STAGE_COLORS[stage] || T.accentPrimary;
              const avg = avgMap.get(stage);
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold w-28 flex-shrink-0" style={{ color: T.textSecondary }}>
                    {STAGE_LABELS[stage]}
                  </span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ backgroundColor: barColor + "12" }}>
                    <div
                      className="h-full rounded-md flex items-center justify-end pr-2 text-[10px] font-bold"
                      style={{
                        width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                        background: count > 0 ? `linear-gradient(90deg, ${barColor}cc, ${barColor})` : "transparent",
                        color: "#fff",
                      }}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </div>
                  {avg && avg.avgDays > 0 && (
                    <span
                      className="text-[9px] font-semibold flex-shrink-0 w-14 text-right"
                      style={{ color: T.textMuted }}
                    >
                      ~{avg.avgDays} дн
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Insights row */}
          <div className="flex flex-wrap gap-2">
            {bottleneckStage && bottleneckCount > 1 && (
              <div
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                style={{ backgroundColor: T.warningSoft }}
              >
                <AlertTriangle size={12} style={{ color: T.warning }} />
                <span className="text-[11px] font-semibold" style={{ color: T.warning }}>
                  Вузьке місце: {STAGE_LABELS[bottleneckStage]} ({bottleneckCount} проєктів)
                </span>
              </div>
            )}
            {slowestStage && slowestStage.avgDays > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                style={{ backgroundColor: T.accentPrimarySoft }}
              >
                <Clock size={12} style={{ color: T.accentPrimary }} />
                <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
                  Найдовший: {STAGE_LABELS[slowestStage.stage]} (~{slowestStage.avgDays} днів)
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
