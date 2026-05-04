"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Building2, Folder, Diamond, ExternalLink } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { stageDisplayName, STAGE_STATUS_LABELS } from "@/lib/constants";
import { computeMargin, computeDeviation, marginTier } from "@/lib/projects/stages-aggregations";
import type { ProjectOverview, StageNode, ToggleState } from "./types";
import type { StageStatus } from "@prisma/client";

type Props = {
  projects: ProjectOverview[];
  toggles: ToggleState;
  selectedStageId: string | null;
  onSelectStage: (projectId: string, stage: StageNode) => void;
  closedProjects: Set<string>;
  closedGroups: Set<string>;
  onToggleProject: (projectId: string) => void;
  onToggleGroup: (groupId: string) => void;
};

const STATUS_TONE: Record<StageStatus, { bg: string; fg: string }> = {
  PENDING: { bg: T.panelElevated, fg: T.textMuted },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  COMPLETED: { bg: T.successSoft, fg: T.success },
};

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  const f = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  return `${f(start)}–${f(end)}`;
}

function MarginCell({ planIncome, planExpense }: { planIncome: number; planExpense: number }) {
  const m = computeMargin(planIncome, planExpense);
  const tier = marginTier(m);
  const color =
    tier === "good" ? T.success : tier === "warn" ? T.warning : tier === "bad" ? T.danger : T.textMuted;
  return (
    <span style={{ color, fontWeight: 600 }}>{m === null ? "—" : `${m}%`}</span>
  );
}

function DeviationCell({ factExpense, planExpense }: { factExpense: number; planExpense: number }) {
  if (factExpense === 0) return <span style={{ color: T.textMuted }}>—</span>;
  const d = computeDeviation(factExpense, planExpense);
  if (d === 0) return <span style={{ color: T.textMuted }}>—</span>;
  return (
    <span style={{ color: d > 0 ? T.danger : T.success, fontWeight: 600 }}>
      {(d > 0 ? "+" : "") + formatCurrency(d)}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? T.success : value > 0 ? T.accentPrimary : T.borderSoft;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          height: 4,
          width: 56,
          background: T.borderSoft,
          borderRadius: 2,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: T.textMuted }}>{value}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: StageStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      style={{
        display: "inline-block",
        background: tone.bg,
        color: tone.fg,
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 4,
        fontWeight: 500,
      }}
    >
      {STAGE_STATUS_LABELS[status]}
    </span>
  );
}

type RenderRow =
  | { kind: "project"; project: ProjectOverview }
  | { kind: "group"; project: ProjectOverview; group: StageNode; depth: 1 }
  | { kind: "stage"; project: ProjectOverview; stage: StageNode; depth: number; hasChildren: boolean }
  | { kind: "sub"; project: ProjectOverview; stage: StageNode; depth: number };

function buildVisible(
  projects: ProjectOverview[],
  closedProjects: Set<string>,
  closedGroups: Set<string>,
  toggles: ToggleState,
): RenderRow[] {
  const out: RenderRow[] = [];
  for (const p of projects) {
    out.push({ kind: "project", project: p });
    if (closedProjects.has(p.id)) continue;

    const byParent = new Map<string | null, StageNode[]>();
    for (const s of p.stages) {
      const key = s.parentStageId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(s);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

    const walkChildren = (parentId: string | null, depth: number) => {
      const kids = byParent.get(parentId) ?? [];
      for (const node of kids) {
        if (toggles.hideCompleted && node.status === "COMPLETED") continue;
        if (node.kind === "GROUP") {
          out.push({ kind: "group", project: p, group: node, depth: 1 });
          if (closedGroups.has(node.id)) continue;
          walkChildren(node.id, depth + 1);
        } else {
          const subKids = byParent.get(node.id) ?? [];
          if (depth === 0 || depth === 1) {
            out.push({
              kind: "stage",
              project: p,
              stage: node,
              depth,
              hasChildren: subKids.length > 0,
            });
            if (subKids.length > 0) {
              for (const sk of subKids) {
                if (toggles.hideCompleted && sk.status === "COMPLETED") continue;
                out.push({ kind: "sub", project: p, stage: sk, depth: depth + 1 });
              }
            }
          } else {
            out.push({ kind: "sub", project: p, stage: node, depth });
          }
        }
      }
    };
    walkChildren(null, 0);
  }
  return out;
}

export function CrossStagesTable({
  projects,
  toggles,
  selectedStageId,
  onSelectStage,
  closedProjects,
  closedGroups,
  onToggleProject,
  onToggleGroup,
}: Props) {
  const rows = useMemo(
    () => buildVisible(projects, closedProjects, closedGroups, toggles),
    [projects, closedProjects, closedGroups, toggles],
  );

  const showFin = !toggles.hideFinance;
  const showDates = !toggles.hideDates;

  const cellPad = "5px 8px";
  const tcStyle = {
    padding: cellPad,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    color: T.textPrimary,
    borderBottom: `1px solid ${T.borderSoft}`,
  };
  const muted = { ...tcStyle, color: T.textMuted, fontSize: 11 };
  const num = { ...tcStyle, textAlign: "right" as const };

  return (
    <div style={{ flex: 1, overflow: "auto", background: T.panel }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: T.textMuted,
                padding: "6px 8px",
                textAlign: "left",
                borderBottom: `1px solid ${T.borderSoft}`,
                background: T.panel,
                position: "sticky",
                top: 0,
                zIndex: 3,
                minWidth: 240,
              }}
            >
              Проєкт / Група / Етап
            </th>
            <th style={thStyle()}>Відповідальний</th>
            <th style={thStyle(96)}>Статус</th>
            {showDates && <th style={thStyle(110)}>Терміни план</th>}
            <th style={thStyle(120)}>Виконання</th>
            {showFin && (
              <>
                <th style={thStyle(102, "right")}>Витрати П</th>
                <th style={thStyle(102, "right")}>Витрати Ф</th>
                <th style={thStyle(96, "right")}>Відхил.</th>
                <th style={thStyle(102, "right")}>Надх. П</th>
                <th style={thStyle(102, "right")}>Надх. Ф</th>
                <th style={thStyle(70, "right")}>Маржа</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} style={{ padding: 30, textAlign: "center", color: T.textMuted }}>
                Немає активних проєктів для відображення.
              </td>
            </tr>
          )}
          {rows.map((row) => {
            if (row.kind === "project") {
              const p = row.project;
              const closed = closedProjects.has(p.id);
              return (
                <tr
                  key={p.id}
                  style={{ background: T.accentPrimarySoft }}
                >
                  <td
                    style={{ ...tcStyle, background: T.accentPrimarySoft, paddingLeft: 8 }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                      onClick={() => onToggleProject(p.id)}
                    >
                      <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>
                        {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </span>
                      <Building2 size={13} style={{ marginRight: 6, color: T.accentPrimary }} />
                      <span style={{ fontWeight: 700 }}>{p.title}</span>
                      {p.clientName && (
                        <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 8 }}>
                          {p.clientName}
                        </span>
                      )}
                      <Link
                        href={`/admin-v2/projects/${p.id}/stages`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: "auto", color: T.textMuted, padding: 2 }}
                        title="Відкрити сторінку етапів"
                      >
                        <ExternalLink size={12} />
                      </Link>
                    </div>
                  </td>
                  <td style={{ ...muted, background: T.accentPrimarySoft }}>
                    {p.managerName ?? "—"}
                  </td>
                  <td style={{ ...tcStyle, background: T.accentPrimarySoft }}>
                    <span
                      style={{
                        background: p.status === "ACTIVE" ? T.successSoft : T.panelElevated,
                        color: p.status === "ACTIVE" ? T.success : T.textMuted,
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 4,
                      }}
                    >
                      {p.status === "ACTIVE" ? "Активний" : "Чернетка"}
                    </span>
                  </td>
                  {showDates && <td style={{ ...muted, background: T.accentPrimarySoft }}></td>}
                  <td style={{ ...tcStyle, background: T.accentPrimarySoft }}>
                    <ProgressBar value={p.progress} />
                  </td>
                  {showFin && (
                    <>
                      <td style={{ ...num, background: T.accentPrimarySoft, color: T.textMuted }}>
                        {formatCurrency(p.planExpense)}
                      </td>
                      <td style={{ ...num, background: T.accentPrimarySoft }}>
                        {formatCurrency(p.factExpense)}
                      </td>
                      <td style={{ ...num, background: T.accentPrimarySoft }}>
                        <DeviationCell factExpense={p.factExpense} planExpense={p.planExpense} />
                      </td>
                      <td style={{ ...num, background: T.accentPrimarySoft, color: T.textMuted }}>
                        {formatCurrency(p.planIncome)}
                      </td>
                      <td style={{ ...num, background: T.accentPrimarySoft }}>
                        {formatCurrency(p.factIncome)}
                      </td>
                      <td style={{ ...num, background: T.accentPrimarySoft }}>
                        <MarginCell planIncome={p.planIncome} planExpense={p.planExpense} />
                      </td>
                    </>
                  )}
                </tr>
              );
            }

            if (row.kind === "group") {
              const g = row.group;
              const closed = closedGroups.has(g.id);
              const totalCols = 4 + (showFin ? 6 : 0) + (showDates ? 1 : 0);
              return (
                <tr key={g.id} style={{ background: T.panelSoft }}>
                  <td style={{ ...tcStyle, background: T.panelSoft }}>
                    <div
                      style={{ display: "flex", alignItems: "center", cursor: "pointer", paddingLeft: 16 }}
                      onClick={() => onToggleGroup(g.id)}
                    >
                      <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>
                        {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </span>
                      <Folder size={12} style={{ marginRight: 6, color: T.textMuted }} />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          color: T.textMuted,
                        }}
                      >
                        {stageDisplayName({ stage: g.stage, customName: g.customName })}
                      </span>
                      <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 8 }}>
                        група
                      </span>
                    </div>
                  </td>
                  <td colSpan={totalCols - 1} style={{ background: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}></td>
                </tr>
              );
            }

            // stage / sub
            const node = row.kind === "stage" ? row.stage : row.stage;
            const project = row.project;
            const isSel = selectedStageId === node.id;
            const indent = row.depth * 14 + 16;
            const isSub = row.kind === "sub";
            const rowBg = isSel ? T.accentPrimarySoft : T.panel;
            const onClick = () => onSelectStage(project.id, node);

            return (
              <tr
                key={node.id}
                onClick={onClick}
                style={{
                  cursor: "pointer",
                  borderLeft: isSel ? `2px solid ${T.accentPrimary}` : "2px solid transparent",
                  opacity: node.status === "COMPLETED" && !toggles.hideCompleted ? 0.55 : 1,
                }}
              >
                <td style={{ ...tcStyle, background: rowBg, paddingLeft: indent }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <Diamond
                      size={isSub ? 9 : 11}
                      style={{ marginRight: 6, color: T.textMuted }}
                    />
                    <span style={{ fontWeight: isSub ? 400 : 500, fontSize: isSub ? 11 : 12 }}>
                      {stageDisplayName({ stage: node.stage, customName: node.customName })}
                    </span>
                  </div>
                </td>
                <td style={{ ...muted, background: rowBg }}>{node.responsibleName ?? "—"}</td>
                <td style={{ ...tcStyle, background: rowBg }}>
                  <StatusBadge status={node.status} />
                </td>
                {showDates && (
                  <td style={{ ...muted, background: rowBg }}>
                    {fmtDateRange(node.startDate, node.endDate)}
                  </td>
                )}
                <td style={{ ...tcStyle, background: rowBg }}>
                  <ProgressBar value={node.progress} />
                </td>
                {showFin && (
                  <>
                    <td style={{ ...num, background: rowBg, color: T.textMuted }}>
                      {node.planExpense > 0 ? formatCurrency(node.planExpense) : "—"}
                    </td>
                    <td style={{ ...num, background: rowBg }}>
                      {node.factExpense > 0 ? formatCurrency(node.factExpense) : "—"}
                    </td>
                    <td style={{ ...num, background: rowBg }}>
                      <DeviationCell factExpense={node.factExpense} planExpense={node.planExpense} />
                    </td>
                    <td style={{ ...num, background: rowBg, color: T.textMuted }}>
                      {node.planIncome > 0 ? formatCurrency(node.planIncome) : "—"}
                    </td>
                    <td style={{ ...num, background: rowBg }}>
                      {node.factIncome > 0 ? formatCurrency(node.factIncome) : "—"}
                    </td>
                    <td style={{ ...num, background: rowBg }}>
                      <MarginCell planIncome={node.planIncome} planExpense={node.planExpense} />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(width?: number, align: "left" | "right" = "left"): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    color: T.textMuted,
    padding: "6px 8px",
    textAlign: align,
    borderBottom: `1px solid ${T.borderSoft}`,
    background: T.panel,
    position: "sticky",
    top: 0,
    zIndex: 3,
    whiteSpace: "nowrap",
    width,
  };
}
