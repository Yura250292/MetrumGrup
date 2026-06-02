"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown, SlidersHorizontal } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  buildTaskTree,
  flattenTree,
  groupTasks,
  type GroupKey,
  type GroupingContext,
} from "@/lib/tasks/grouping";
import { sumGroupCost, type TaskCost } from "@/lib/tasks/cost";
import { InlineStatusPicker } from "./inline-status-picker";
import { PriorityPicker, DueDatePicker, type TaskPriorityValue } from "./task-inline-pickers";
import type { TaskTableItem } from "./tab-tasks";

type StatusLite = { id: string; name: string; color: string; isDone: boolean; position: number };

type ColumnKey =
  | "status"
  | "assignee"
  | "dueDate"
  | "priority"
  | "progress"
  | "costPlan"
  | "costFact";

const COLUMN_DEFS: { key: ColumnKey; label: string; financeOnly?: boolean }[] = [
  { key: "status", label: "Статус" },
  { key: "assignee", label: "Виконавець" },
  { key: "dueDate", label: "Дедлайн" },
  { key: "priority", label: "Пріоритет" },
  { key: "progress", label: "Прогрес" },
  { key: "costPlan", label: "Витрати план", financeOnly: true },
  { key: "costFact", label: "Витрати факт", financeOnly: true },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["status", "assignee", "dueDate", "priority"];

export function TaskTable({
  tasks,
  statuses,
  groupBy,
  groupingCtx,
  expandedTasks,
  collapsedGroups,
  costMap,
  canViewCost,
  projectId,
  onToggleGroup,
  onToggleTask,
  onOpen,
  onChangeStatus,
  onChangePriority,
  onChangeDueDate,
}: {
  tasks: TaskTableItem[];
  statuses: StatusLite[];
  groupBy: GroupKey;
  groupingCtx: GroupingContext;
  expandedTasks: Set<string>;
  collapsedGroups: Set<string>;
  costMap: Map<string, TaskCost>;
  canViewCost: boolean;
  projectId?: string;
  onToggleGroup: (key: string) => void;
  onToggleTask: (id: string) => void;
  onOpen: (id: string) => void;
  onChangeStatus: (id: string, statusId: string) => void;
  onChangePriority: (id: string, p: TaskPriorityValue) => void;
  onChangeDueDate: (id: string, iso: string | null) => void;
}) {
  // Вибір колонок — persist у localStorage (durable target: SavedView.columnsJson).
  const storageKey = `metrum:task-table-cols:${projectId ?? "default"}`;
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setColumns(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (!colMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colMenuOpen]);

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Cost-колонки лише під RBAC.
  const visibleColumns = useMemo(
    () => columns.filter((c) => canViewCost || (c !== "costPlan" && c !== "costFact")),
    [columns, canViewCost],
  );
  const availableColumns = COLUMN_DEFS.filter((c) => canViewCost || !c.financeOnly);

  const { rootNodeById, groups } = useMemo(() => {
    const tree = buildTaskTree(tasks);
    const rootNodeById = new Map(tree.map((n) => [n.task.id, n]));
    const groups = groupTasks(
      tree.map((n) => n.task),
      groupBy,
      groupingCtx,
    );
    return { rootNodeById, groups };
  }, [tasks, groupBy, groupingCtx]);

  const totalCols = 1 + visibleColumns.length; // Name + columns

  const cell = "px-3 py-2 text-[12px] align-middle";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center justify-end px-3 py-2" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div ref={colMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setColMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
            style={{ backgroundColor: T.panelElevated, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            <SlidersHorizontal size={12} />
            Колонки
          </button>
          {colMenuOpen && (
            <div
              className="absolute right-0 z-30 mt-1 flex min-w-[180px] flex-col gap-0.5 rounded-xl p-1 shadow-lg"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              {availableColumns.map((c) => {
                const active = columns.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleColumn(c.key)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold"
                    style={{ color: active ? T.accentPrimary : T.textPrimary }}
                  >
                    <span className="w-3">{active ? "✓" : ""}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
            <th className={`${cell} text-left font-semibold`} style={{ color: T.textMuted }}>
              Задача
            </th>
            {visibleColumns.map((c) => (
              <th key={c} className={`${cell} text-left font-semibold`} style={{ color: T.textMuted }}>
                {COLUMN_DEFS.find((d) => d.key === c)?.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td colSpan={totalCols} className={`${cell} text-center`} style={{ color: T.textMuted }}>
                Немає задач
              </td>
            </tr>
          )}
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            const subtotal = canViewCost
              ? sumGroupCost(
                  group.items.map((it) => costMap.get(it.id)).filter((c): c is TaskCost => !!c),
                )
              : null;
            const rows: ReactNode[] = [];
            rows.push(
              <tr key={`g-${group.key}`} style={{ backgroundColor: T.panelElevated }}>
                <td colSpan={totalCols} className="px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.key)}
                    className="flex w-full items-center gap-2"
                  >
                    {collapsed ? (
                      <ChevronRight size={14} style={{ color: T.textMuted }} />
                    ) : (
                      <ChevronDown size={14} style={{ color: T.textMuted }} />
                    )}
                    {group.color ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: group.color + "22", color: group.color }}
                      >
                        {group.label}
                      </span>
                    ) : (
                      <span className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
                        {group.label}
                      </span>
                    )}
                    <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
                      {group.items.length}
                    </span>
                    {subtotal && (
                      <span className="ml-auto text-[11px] font-semibold" style={{ color: T.textMuted }}>
                        план {formatCurrencyCompact(subtotal.planned)} · факт{" "}
                        {formatCurrencyCompact(subtotal.actual)}
                      </span>
                    )}
                  </button>
                </td>
              </tr>,
            );
            if (!collapsed) {
              for (const it of group.items) {
                const node = rootNodeById.get(it.id);
                if (!node) continue;
                for (const n of flattenTree([node], (x) => expandedTasks.has(x.task.id))) {
                  const task = n.task;
                  const cost = canViewCost ? costMap.get(task.id) : undefined;
                  rows.push(
                    <tr
                      key={task.id}
                      onClick={() => onOpen(task.id)}
                      className="cursor-pointer transition hover:brightness-95"
                      style={{ borderTop: `1px solid ${T.borderSoft}`, opacity: task.isArchived ? 0.6 : 1 }}
                    >
                      <td className={cell}>
                        <div className="flex items-center gap-1.5" style={{ paddingLeft: n.depth * 20 }}>
                          {n.children.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTask(task.id);
                              }}
                              className="flex h-4 w-4 items-center justify-center"
                              style={{ color: T.textMuted }}
                            >
                              {expandedTasks.has(task.id) ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )}
                            </button>
                          ) : (
                            <span className="w-4" />
                          )}
                          <span style={{ color: T.textPrimary, textDecoration: task.isArchived ? "line-through" : "none" }}>
                            {task.title}
                          </span>
                          {task._count.subtasks > 0 && (
                            <span className="text-[10px] font-semibold" style={{ color: T.textMuted }}>
                              ({task._count.subtasks})
                            </span>
                          )}
                        </div>
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col} className={cell} onClick={(e) => e.stopPropagation()}>
                          {col === "status" && (
                            <InlineStatusPicker
                              current={task.status}
                              statuses={statuses}
                              onChange={(sid) => onChangeStatus(task.id, sid)}
                            />
                          )}
                          {col === "assignee" && (
                            <span style={{ color: T.textMuted }}>
                              {task.assignees.length === 0
                                ? "—"
                                : task.assignees.map((a) => a.user.name).join(", ")}
                            </span>
                          )}
                          {col === "dueDate" && (
                            <DueDatePicker
                              current={task.dueDate}
                              onChange={(d) => onChangeDueDate(task.id, d)}
                            />
                          )}
                          {col === "priority" && (
                            <PriorityPicker
                              current={task.priority}
                              onChange={(p) => onChangePriority(task.id, p)}
                            />
                          )}
                          {col === "progress" && (
                            <span style={{ color: T.textMuted }} className="tabular-nums">
                              {task.progressPercent ?? 0}%
                            </span>
                          )}
                          {col === "costPlan" && (
                            <span style={{ color: T.textMuted }} className="tabular-nums">
                              {cost ? formatCurrencyCompact(cost.plannedRollup) : "—"}
                            </span>
                          )}
                          {col === "costFact" && (
                            <span style={{ color: T.textMuted }} className="tabular-nums">
                              {cost ? formatCurrencyCompact(cost.actualRollup) : "—"}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>,
                  );
                }
              }
            }
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
}
