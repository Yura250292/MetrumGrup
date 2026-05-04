"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { StagesSection, type ResponsibleCandidate } from "../../[id]/_components/stages-section";
import { computeMargin, marginTier } from "@/lib/projects/stages-aggregations";
import type { ProjectBundle } from "./types";

const COLLAPSED_KEY = "metrum:cross-stages:collapsed-projects";
const PM_FILTER_KEY = "metrum:cross-stages:pm-filter";

type Props = {
  bundles: ProjectBundle[];
  candidates: ResponsibleCandidate[];
  currentUserId: string | null;
};

function loadCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function loadPmFilter(): "all" | "me" {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(PM_FILTER_KEY);
    if (raw === "me") return "me";
  } catch {}
  return "all";
}

export function CrossProjectStagesView({
  bundles,
  candidates,
  currentUserId,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [pmFilter, setPmFilter] = useState<"all" | "me">(loadPmFilter);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLLAPSED_KEY,
        JSON.stringify(Array.from(collapsed)),
      );
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PM_FILTER_KEY, pmFilter);
    } catch {}
  }, [pmFilter]);

  function toggleProject(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleBundles = bundles.filter((b) => {
    if (pmFilter !== "me") return true;
    if (!currentUserId) return true;
    if (b.stages.some((s) => s.responsibleUserId === currentUserId)) return true;
    return false;
  });

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Top filter bar */}
      <div
        className="flex items-center gap-3 rounded-lg border px-4 py-3"
        style={{
          background: T.panel,
          borderColor: T.borderSoft,
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          Вигляд:
        </span>
        <button
          type="button"
          onClick={() => setPmFilter("all")}
          className="rounded-full border px-3 py-1 text-[11px] font-medium"
          style={{
            background: pmFilter === "all" ? T.accentPrimarySoft : T.panel,
            borderColor: pmFilter === "all" ? T.accentPrimary : T.borderSoft,
            color: pmFilter === "all" ? T.accentPrimary : T.textMuted,
          }}
        >
          Усі проєкти
        </button>
        <button
          type="button"
          onClick={() => setPmFilter("me")}
          className="rounded-full border px-3 py-1 text-[11px] font-medium"
          style={{
            background: pmFilter === "me" ? T.accentPrimarySoft : T.panel,
            borderColor: pmFilter === "me" ? T.accentPrimary : T.borderSoft,
            color: pmFilter === "me" ? T.accentPrimary : T.textMuted,
          }}
        >
          Мої
        </button>
        <span
          className="ml-auto text-[11px]"
          style={{ color: T.textMuted }}
        >
          {visibleBundles.length} {visibleBundles.length === 1 ? "проєкт" : "проєктів"}
        </span>
      </div>

      {visibleBundles.length === 0 && (
        <div
          className="rounded-lg border border-dashed py-12 text-center text-[13px]"
          style={{
            borderColor: T.borderSoft,
            color: T.textMuted,
            background: T.panelSoft,
          }}
        >
          Немає активних проєктів для відображення.
        </div>
      )}

      {visibleBundles.map((b) => {
        const isCollapsed = collapsed.has(b.id);
        const margin = computeMargin(b.planIncome, b.planExpense);
        const tier = marginTier(margin);
        const marginColor =
          tier === "good"
            ? T.success
            : tier === "warn"
              ? T.warning
              : tier === "bad"
                ? T.danger
                : T.textMuted;

        return (
          <div
            key={b.id}
            className="rounded-lg border"
            style={{
              borderColor: T.borderSoft,
              background: T.panel,
              overflow: "hidden",
            }}
          >
            {/* Project header */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3"
              style={{ background: T.accentPrimarySoft }}
              onClick={() => toggleProject(b.id)}
            >
              <span style={{ color: T.accentPrimary }}>
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </span>
              <Building2 size={18} style={{ color: T.accentPrimary }} />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[14px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {b.title}
                </div>
                <div
                  className="truncate text-[11px]"
                  style={{ color: T.textMuted }}
                >
                  {b.clientName ?? "—"}
                  {b.managerName ? ` · ${b.managerName}` : ""}
                </div>
              </div>

              <div
                className="hidden items-center gap-4 text-[11px] sm:flex"
                style={{ color: T.textSecondary }}
              >
                <Stat label="Прогрес" value={`${b.progress}%`} />
                <Stat label="Витрати П" value={formatCurrency(b.planExpense)} />
                <Stat
                  label="Витрати Ф"
                  value={formatCurrency(b.factExpense)}
                  color={
                    b.factExpense > b.planExpense ? T.danger : T.textPrimary
                  }
                />
                <Stat label="Надх. П" value={formatCurrency(b.planIncome)} />
                <Stat label="Надх. Ф" value={formatCurrency(b.factIncome)} />
                <Stat
                  label="Маржа"
                  value={margin !== null ? `${margin}%` : "—"}
                  color={marginColor}
                />
              </div>

              <Link
                href={`/admin-v2/projects/${b.id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded p-1.5"
                style={{ color: T.textMuted }}
                title="Відкрити сторінку проєкту"
              >
                <ExternalLink size={14} />
              </Link>
            </div>

            {/* Project body — full StagesSection (rich UI with inline edit, drawer, publish) */}
            {!isCollapsed && (
              <div className="p-4">
                <StagesSection
                  projectId={b.id}
                  projectTitle={b.title}
                  initialStages={b.stages}
                  candidates={candidates}
                  isTestProject={b.isTestProject}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[9px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: color ?? T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
