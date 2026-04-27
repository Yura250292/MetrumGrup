"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, RefreshCcw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { ProjectOption } from "./types";

type CostType = "MATERIAL" | "LABOR" | "SUBCONTRACT" | "EQUIPMENT" | "OVERHEAD" | "OTHER";

type BudgetRow = {
  costCodeId: string | null;
  code: string | null;
  name: string;
  parentId: string | null;
  depth: number;
  isLeaf: boolean;
  defaultCostType: CostType | null;
  plan: number;
  revised: number;
  committed: number;
  actual: number;
  forecast: number;
  variance: number;
};

type BudgetMatrix = {
  project: { id: string; title: string };
  rows: BudgetRow[];
  totals: BudgetRow extends { plan: number } ? Omit<BudgetRow, "code" | "name" | "parentId" | "depth" | "isLeaf" | "defaultCostType" | "costCodeId"> : never;
  meta: {
    estimatesIncluded: number;
    unclassifiedPlan: number;
    unclassifiedActual: number;
  };
};

const COST_TYPE_LABELS: Record<CostType, string> = {
  MATERIAL: "Матеріали",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

export function TabBudgetActual({
  scope,
  projects,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(scope?.id ?? null);
  const [matrix, setMatrix] = useState<BudgetMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const projectOptions: ComboboxOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );

  async function load(projectId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/budget-vs-actual`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Помилка завантаження");
      }
      const data = (await res.json()) as BudgetMatrix;
      setMatrix(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedProjectId) {
      void load(selectedProjectId);
    } else {
      setMatrix(null);
    }
  }, [selectedProjectId]);

  // Filter visible rows: hide children of collapsed parents.
  const visibleRows = useMemo(() => {
    if (!matrix) return [];
    return matrix.rows.filter((r) => {
      let cur = r.parentId;
      while (cur) {
        if (collapsed.has(cur)) return false;
        const parent = matrix.rows.find((x) => x.costCodeId === cur);
        cur = parent?.parentId ?? null;
      }
      return true;
    });
  }, [matrix, collapsed]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasParents = useMemo(
    () => (matrix?.rows ?? []).some((r) => r.parentId === null && !r.isLeaf),
    [matrix],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Project picker (only outside project scope) */}
      {!scope && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <span
              className="mb-1 block text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Проєкт
            </span>
            <Combobox
              value={selectedProjectId}
              options={projectOptions}
              onChange={(id) => setSelectedProjectId(id)}
              placeholder="Виберіть проєкт…"
              searchPlaceholder="Пошук проєкту…"
              emptyMessage="Проєкти відсутні"
            />
          </div>
          {selectedProjectId && (
            <button
              onClick={() => void load(selectedProjectId)}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textSecondary,
              }}
            >
              <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
              Оновити
            </button>
          )}
        </div>
      )}

      {!selectedProjectId && (
        <div
          className="rounded-2xl px-6 py-12 text-center text-sm"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px dashed ${T.borderStrong}`,
            color: T.textMuted,
          }}
        >
          Виберіть проєкт, щоб побачити матрицю «План vs Факт».
        </div>
      )}

      {selectedProjectId && loading && !matrix && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={20} style={{ color: T.textMuted }} />
        </div>
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            border: `1px solid ${T.danger}40`,
            color: T.danger,
          }}
        >
          {error}
        </div>
      )}

      {matrix && matrix.rows.length === 0 && (
        <div
          className="rounded-2xl px-6 py-12 text-center text-sm"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px dashed ${T.borderStrong}`,
            color: T.textMuted,
          }}
        >
          {matrix.meta.estimatesIncluded === 0
            ? "У проєкті немає підтверджених кошторисів. План з'явиться коли кошторис перейде у статус APPROVED."
            : "Жодна позиція кошторису й жодна операція ще не прив'язана до cost-code. Призначте статтю витрат у формі операції або у позиції кошторису."}
        </div>
      )}

      {matrix && matrix.rows.length > 0 && (
        <>
          {/* Totals header */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCell label="План" value={matrix.totals.plan} />
            <KpiCell label="Факт" value={matrix.totals.actual} tone="actual" />
            <KpiCell
              label="Залишок"
              value={matrix.totals.variance}
              tone={matrix.totals.variance < 0 ? "bad" : "good"}
            />
            <KpiCell label="Прогноз" value={matrix.totals.forecast} tone="muted" />
          </div>

          <div
            className="overflow-x-auto rounded-2xl"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
              <thead>
                <tr
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
                >
                  <th className="sticky left-0 px-4 py-3 text-left" style={{ backgroundColor: T.panelSoft }}>
                    Стаття
                  </th>
                  <th className="px-3 py-3 text-right">Тип</th>
                  <th className="px-3 py-3 text-right">План</th>
                  <th className="px-3 py-3 text-right">Факт</th>
                  <th className="px-3 py-3 text-right">Залишок</th>
                  <th className="px-3 py-3 text-right">% виконання</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const key = r.costCodeId ?? "unclassified";
                  const isCollapsed = r.costCodeId ? collapsed.has(r.costCodeId) : false;
                  const pct = r.revised > 0 ? Math.round((r.actual / r.revised) * 100) : null;
                  const isOverrun = r.variance < 0;
                  return (
                    <tr
                      key={key}
                      className="border-t transition"
                      style={{ borderColor: T.borderSoft }}
                    >
                      <td
                        className="sticky left-0 px-4 py-2.5"
                        style={{
                          backgroundColor: T.panel,
                          paddingLeft: 16 + r.depth * 18,
                          fontWeight: r.depth === 0 ? 600 : 400,
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {!r.isLeaf && r.costCodeId && (
                            <button
                              type="button"
                              onClick={() => toggleCollapse(r.costCodeId!)}
                              className="rounded p-0.5 hover:bg-black/10"
                              aria-label={isCollapsed ? "Розгорнути" : "Згорнути"}
                            >
                              <ChevronRight
                                size={14}
                                className="transition"
                                style={{
                                  transform: isCollapsed ? "none" : "rotate(90deg)",
                                  color: T.textMuted,
                                }}
                              />
                            </button>
                          )}
                          {r.isLeaf && hasParents && <span className="w-[18px]" />}
                          <span className="text-[11px]" style={{ color: T.textMuted }}>
                            {r.code !== "__unclassified__" ? r.code : ""}
                          </span>
                          <span className="truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.defaultCostType ? (
                          <span
                            className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
                          >
                            {COST_TYPE_LABELS[r.defaultCostType]}
                          </span>
                        ) : (
                          <span style={{ color: T.textMuted }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.plan > 0 ? formatCurrencyCompact(r.plan) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.actual > 0 ? formatCurrencyCompact(r.actual) : "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums font-semibold"
                        style={{ color: isOverrun ? T.danger : r.variance > 0 ? T.success : T.textMuted }}
                      >
                        {r.plan === 0 && r.actual === 0 ? "—" : formatCurrencyCompact(r.variance)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {pct === null ? (
                          <span style={{ color: T.textMuted }}>—</span>
                        ) : (
                          <span
                            style={{
                              color:
                                pct > 100 ? T.danger : pct >= 80 ? T.warning : T.success,
                              fontWeight: 600,
                            }}
                          >
                            {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMuted }}>
            <span>Кошторисів враховано: {matrix.meta.estimatesIncluded}</span>
            {matrix.meta.unclassifiedPlan > 0 && (
              <span>
                План без статті: {formatCurrencyCompact(matrix.meta.unclassifiedPlan)}
              </span>
            )}
            {matrix.meta.unclassifiedActual > 0 && (
              <span>
                Факт без статті: {formatCurrencyCompact(matrix.meta.unclassifiedActual)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "actual" | "good" | "bad" | "muted";
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
      ? T.danger
      : tone === "actual"
      ? T.accentPrimary
      : tone === "muted"
      ? T.textSecondary
      : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums" style={{ color }}>
        {formatCurrencyCompact(value)}
      </div>
    </div>
  );
}
