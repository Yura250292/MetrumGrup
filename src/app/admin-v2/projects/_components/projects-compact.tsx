"use client";

import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { StatusBadge } from "./projects-cards";
import type { ProjectRow } from "./projects-types";

export function ProjectsCompact({ projects }: { projects: ProjectRow[] }) {
  if (projects.length === 0) {
    return (
      <p className="text-[12px] text-center py-8" style={{ color: T.textMuted }}>
        Немає проєктів у цій папці
      </p>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {projects.map((p, i) => {
        const pct = p.totalBudget > 0 ? Math.round((p.totalPaid / p.totalBudget) * 100) : 0;
        return (
          <Link
            key={p.id}
            href={`/admin-v2/projects/${p.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--t-panel-el)]"
            style={{
              borderTop: i === 0 ? undefined : `1px solid ${T.borderSoft}`,
              opacity: p.isTestProject ? 0.55 : 1,
            }}
          >
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <span
                className="font-medium text-[13px] truncate max-w-[40%]"
                style={{ color: T.textPrimary }}
              >
                {p.title}
              </span>
              <span className="text-[12px] truncate hidden md:inline" style={{ color: T.textSecondary }}>
                {p.client.name}
              </span>
              <StatusBadge status={p.status} />
              {p.isTestProject && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                  style={{
                    backgroundColor: T.warningSoft,
                    color: T.warning,
                    border: `1px dashed ${T.warning}`,
                  }}
                  title="Тестовий проєкт"
                >
                  ТЕСТ
                </span>
              )}
              <span className="text-[11px] truncate hidden lg:inline" style={{ color: T.textMuted }}>
                {STAGE_LABELS[p.currentStage]} · {p.stageProgress}%
              </span>
            </div>
            <div className="flex items-center gap-4 text-[12px] flex-shrink-0">
              <span className="tabular-nums hidden sm:inline" style={{ color: T.textSecondary }}>
                {formatCurrency(p.totalBudget)}
              </span>
              <span className="tabular-nums w-10 text-right" style={{ color: T.textMuted }}>
                {pct}%
              </span>
              <span className="tabular-nums w-20 text-right hidden md:inline" style={{ color: T.textMuted }}>
                {p.extra.expectedEndDate ? formatDateShort(p.extra.expectedEndDate) : "—"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
