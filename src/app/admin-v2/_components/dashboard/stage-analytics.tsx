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
      className="premium-card rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="section-head">
        <h2>Потік роботи</h2>
        <span className="sub">разом {activeProjectsCount}</span>
      </div>

      {activeProjectsCount === 0 ? (
        <p className="text-[12.5px] px-5 py-6 text-center" style={{ color: T.textMuted }}>
          Немає активних проєктів
        </p>
      ) : (
        <div className="px-5 py-4">
          <div
            className="text-[10.5px] font-semibold uppercase mb-2"
            style={{ color: T.textMuted, letterSpacing: "0.08em" }}
          >
            Розподіл по етапах
          </div>
          <div>
            {STAGE_ORDER.map((stage) => {
              const count = stageMap.get(stage) ?? 0;
              const pct = Math.max(count > 0 ? 6 : 2, (count / stageMax) * 100);
              const barColor = STAGE_COLORS[stage] || T.accentPrimary;
              const avg = avgMap.get(stage);
              return (
                <div key={stage} className="bar-row">
                  <span className="name">{STAGE_LABELS[stage]}</span>
                  <div className="bar">
                    <div
                      className="fill"
                      style={{
                        width: `${pct}%`,
                        background: count > 0 ? barColor : "transparent",
                      }}
                    />
                  </div>
                  <span className="amt" style={{ width: 90 }}>
                    {count > 0 ? count : "—"}
                    {avg && avg.avgDays > 0 && (
                      <span
                        className="text-[10px] font-normal ml-1"
                        style={{ color: T.textMuted }}
                      >
                        · ~{avg.avgDays}д
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {(bottleneckStage || slowestStage) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
              {bottleneckStage && bottleneckCount > 1 && (
                <div
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1"
                  style={{ backgroundColor: T.warningSoft }}
                >
                  <AlertTriangle size={11} style={{ color: T.warning }} />
                  <span className="text-[11px] font-semibold" style={{ color: T.warning }}>
                    Вузьке місце: {STAGE_LABELS[bottleneckStage]} ({bottleneckCount})
                  </span>
                </div>
              )}
              {slowestStage && slowestStage.avgDays > 0 && (
                <div
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <Clock size={11} style={{ color: T.accentPrimary }} />
                  <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
                    Найдовший: {STAGE_LABELS[slowestStage.stage]} (~{slowestStage.avgDays}д)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
