"use client";

import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectRow } from "./projects-types";

/**
 * Timeline (Gantt-light) view для списку проєктів. Кожен проєкт — полоса
 * від startDate до expectedEndDate на горизонтальній місячній шкалі.
 * Без зовнішніх залежностей — простий DIV grid.
 *
 * Range: -3 місяці від сьогодні до +12 місяців. Якщо проект виходить за
 * межі — обрізається до краю з візуальним індикатором.
 */
export function ProjectsTimeline({ projects }: { projects: ProjectRow[] }) {
  // Будуємо шкалу місяців: 15 місяців (3 минулі + поточний + 11 майбутніх)
  const now = new Date();
  const monthsBack = 3;
  const monthsForward = 11;
  const startMonth = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() + monthsForward + 1, 0);

  // Місяці для header
  const months: Array<{ start: Date; label: string }> = [];
  for (let i = 0; i <= monthsBack + monthsForward; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + i, 1);
    months.push({
      start: d,
      label: d.toLocaleDateString("uk-UA", { month: "short", year: "2-digit" }),
    });
  }

  const todayPct = Math.max(
    0,
    Math.min(
      100,
      ((now.getTime() - startMonth.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100,
    ),
  );

  if (projects.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-[13px]"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Немає проєктів для відображення на шкалі.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row: months */}
          <div
            className="flex sticky top-0 z-10"
            style={{
              backgroundColor: T.panelSoft,
              borderBottom: `1px solid ${T.borderSoft}`,
            }}
          >
            <div
              className="flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wider font-bold"
              style={{
                width: 220,
                color: T.textMuted,
                borderRight: `1px solid ${T.borderSoft}`,
              }}
            >
              Проєкт
            </div>
            <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="px-1 py-2 text-[10px] font-semibold text-center"
                  style={{
                    color: T.textSecondary,
                    borderRight: i < months.length - 1 ? `1px solid ${T.borderSoft}` : undefined,
                  }}
                >
                  {m.label}
                </div>
              ))}
              {/* Today vertical line */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${todayPct}%`,
                  width: 0,
                  borderLeft: `2px dashed ${T.danger}`,
                  zIndex: 5,
                }}
                title={`Сьогодні: ${now.toLocaleDateString("uk-UA")}`}
              />
            </div>
          </div>

          {/* Rows: one per project */}
          {projects.map((p) => (
            <TimelineRow
              key={p.id}
              project={p}
              startMonth={startMonth}
              endMonth={endMonth}
              monthCount={months.length}
              todayPct={todayPct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  project,
  startMonth,
  endMonth,
  monthCount,
  todayPct,
}: {
  project: ProjectRow;
  startMonth: Date;
  endMonth: Date;
  monthCount: number;
  todayPct: number;
}) {
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.extra.expectedEndDate ? new Date(project.extra.expectedEndDate) : null;

  // Якщо немає дат — показуємо placeholder в центрі.
  const hasRange = start && end && end > start;
  const clampedStart = hasRange
    ? new Date(Math.max(startMonth.getTime(), start!.getTime()))
    : null;
  const clampedEnd = hasRange
    ? new Date(Math.min(endMonth.getTime(), end!.getTime()))
    : null;

  const leftPct = clampedStart
    ? ((clampedStart.getTime() - startMonth.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100
    : 0;
  const widthPct = clampedStart && clampedEnd
    ? ((clampedEnd.getTime() - clampedStart.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100
    : 0;

  // Color по статусу
  const barColor = (() => {
    switch (project.status) {
      case "ACTIVE": return { bg: T.success, soft: T.successSoft };
      case "DRAFT": return { bg: T.warning, soft: T.warningSoft };
      case "ON_HOLD": return { bg: T.textMuted, soft: T.panelSoft };
      case "COMPLETED": return { bg: T.accentPrimary, soft: T.accentPrimarySoft };
      case "CANCELLED": return { bg: T.danger, soft: T.dangerSoft };
      default: return { bg: T.textMuted, soft: T.panelSoft };
    }
  })();

  return (
    <Link
      href={`/admin-v2/projects/${project.id}`}
      className="flex items-stretch group hover:bg-[var(--t-panel-soft)]"
      style={{ borderBottom: `1px solid ${T.borderSoft}` }}
    >
      {/* Left column: project name */}
      <div
        className="flex-shrink-0 px-3 py-2.5 min-w-0"
        style={{
          width: 220,
          borderRight: `1px solid ${T.borderSoft}`,
        }}
      >
        <div className="text-[12px] font-semibold truncate" style={{ color: T.textPrimary }}>
          {project.title}
        </div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: T.textMuted }}>
          {project.manager?.name ?? "ПМ не призначено"}
        </div>
      </div>

      {/* Right: timeline */}
      <div className="flex-1 relative grid" style={{ gridTemplateColumns: `repeat(${monthCount}, 1fr)` }}>
        {/* Background month grid */}
        {Array.from({ length: monthCount }).map((_, i) => (
          <div
            key={i}
            style={{
              borderRight: i < monthCount - 1 ? `1px solid ${T.borderSoft}` : undefined,
            }}
          />
        ))}

        {/* Today vertical line (per-row continuation) */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${todayPct}%`,
            width: 0,
            borderLeft: `1px dashed ${T.danger}`,
            opacity: 0.5,
          }}
        />

        {/* Project bar */}
        {hasRange ? (
          <div
            className="absolute top-2.5 bottom-2.5 rounded-md overflow-hidden flex items-center px-2 transition group-hover:brightness-95"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              minWidth: 40,
              backgroundColor: barColor.soft,
              border: `1px solid ${barColor.bg}`,
            }}
            title={`${project.title} · ${start!.toLocaleDateString("uk-UA")} → ${end!.toLocaleDateString("uk-UA")}`}
          >
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.min(100, Math.max(0, project.stageProgress))}%`,
                backgroundColor: barColor.bg,
                opacity: 0.4,
              }}
            />
            <span
              className="relative text-[10px] font-bold truncate"
              style={{ color: barColor.bg }}
            >
              {project.stageProgress > 0 ? `${project.stageProgress}%` : "—"}
            </span>
          </div>
        ) : (
          <div
            className="absolute top-1/2 -translate-y-1/2 text-[10px] italic"
            style={{ left: 12, color: T.textMuted }}
          >
            Дати не задані
          </div>
        )}
      </div>
    </Link>
  );
}
