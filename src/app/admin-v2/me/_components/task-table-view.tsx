"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  Play,
  Square,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { TaskItem, TaskStatus } from "./use-me-tasks";
import { isOverdue, PRIORITY_COLOR } from "./use-me-tasks";
import { ExternalAssigneeChip } from "./external-assignee-chip";
import {
  InlineStatusPicker,
  type InlineStatus,
} from "@/app/admin-v2/projects/[id]/_components/inline-status-picker";

const PRIORITY_LABEL: Record<TaskItem["priority"], string> = {
  LOW: "Низький",
  NORMAL: "Нормальний",
  HIGH: "Високий",
  URGENT: "Терміновий",
};
const PRIORITY_ORDER: TaskItem["priority"][] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

type Props = {
  tasks: TaskItem[];
  loading: boolean;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
  /** Опц.: викликається з payload-патчем, який фронт пише оптимістично.
   *  Якщо не передано — inline-editing вимкнено, тільки read-only вигляд. */
  onPatch?: (taskId: string, patch: Record<string, unknown>) => void;
};

export function TaskTableView({
  tasks,
  loading,
  activeTimerTaskId,
  pendingId,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onPatch,
}: Props) {
  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, { project: TaskItem["project"]; tasks: TaskItem[] }>();
    for (const t of tasks) {
      const key = t.project.id;
      if (!map.has(key)) map.set(key, { project: t.project, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [tasks]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (projectId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Cache statuses per project (lazy — fetch on first picker open).
  const [statusCache, setStatusCache] = useState<Record<string, TaskStatus[]>>({});
  const inflight = useRef<Set<string>>(new Set());
  const ensureStatuses = useCallback(async (projectId: string) => {
    if (statusCache[projectId] || inflight.current.has(projectId)) return;
    inflight.current.add(projectId);
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/statuses`);
      if (!r.ok) return;
      const j = await r.json();
      setStatusCache((prev) => ({ ...prev, [projectId]: j.data ?? [] }));
    } finally {
      inflight.current.delete(projectId);
    }
  }, [statusCache]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft, color: T.textMuted }}
      >
        Завантаження задач…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-[13px]"
        style={{ backgroundColor: T.panel, border: "1px solid " + T.borderSoft, color: T.textMuted }}
      >
        Немає задач
      </div>
    );
  }

  const cellBorder = `1px solid ${T.borderSoft}`;

  return (
    <div
      className="rounded-2xl overflow-x-auto"
      style={{
        backgroundColor: T.panel,
        border: cellBorder,
      }}
    >
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth: 980 }}
      >
        <colgroup>
          <col style={{ width: 28 }} />
          <col style={{ width: 36 }} />
          <col />
          <col style={{ width: 160 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 90 }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: T.panelElevated }}>
            <Th border={cellBorder} />
            <Th border={cellBorder}>!</Th>
            <Th border={cellBorder}>Задача</Th>
            <Th border={cellBorder}>Проєкт</Th>
            <Th border={cellBorder}>Виконавці</Th>
            <Th border={cellBorder}>Мітки</Th>
            <Th border={cellBorder}>Статус</Th>
            <Th border={cellBorder}>Дата</Th>
            <Th border={cellBorder} last>Дії</Th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => {
            const isCollapsed = collapsed.has(group.project.id);
            const doneCount = group.tasks.filter((t) => t.status.isDone).length;
            return (
              <GroupRows
                key={group.project.id}
                group={group}
                isCollapsed={isCollapsed}
                doneCount={doneCount}
                cellBorder={cellBorder}
                activeTimerTaskId={activeTimerTaskId}
                pendingId={pendingId}
                statusesByProject={statusCache}
                onEnsureStatuses={ensureStatuses}
                onToggleCollapse={() => toggleCollapse(group.project.id)}
                onOpenDrawer={onOpenDrawer}
                onStartTimer={onStartTimer}
                onStopTimer={onStopTimer}
                onMarkDone={onMarkDone}
                onPatch={onPatch}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  border,
  last,
}: {
  children?: React.ReactNode;
  border: string;
  last?: boolean;
}) {
  return (
    <th
      scope="col"
      className="text-[10px] font-bold tracking-wider uppercase px-3 py-2.5"
      style={{
        color: T.textMuted,
        borderRight: last ? undefined : border,
        borderBottom: border,
        position: "sticky",
        top: 0,
        backgroundColor: T.panelElevated,
        zIndex: 1,
      }}
    >
      {children}
    </th>
  );
}

function GroupRows({
  group,
  isCollapsed,
  doneCount,
  cellBorder,
  activeTimerTaskId,
  pendingId,
  statusesByProject,
  onEnsureStatuses,
  onToggleCollapse,
  onOpenDrawer,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onPatch,
}: {
  group: { project: TaskItem["project"]; tasks: TaskItem[] };
  isCollapsed: boolean;
  doneCount: number;
  cellBorder: string;
  activeTimerTaskId: string | null;
  pendingId: string | null;
  statusesByProject: Record<string, TaskStatus[]>;
  onEnsureStatuses: (projectId: string) => void;
  onToggleCollapse: () => void;
  onOpenDrawer: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onMarkDone: (task: TaskItem) => void;
  onPatch?: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={9}
          style={{
            backgroundColor: T.accentPrimarySoft,
            borderBottom: cellBorder,
            padding: 0,
          }}
        >
          <button
            onClick={onToggleCollapse}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:brightness-[0.97]"
          >
            {isCollapsed ? (
              <ChevronRight size={14} style={{ color: T.accentPrimary }} />
            ) : (
              <ChevronDown size={14} style={{ color: T.accentPrimary }} />
            )}
            <span className="text-[13px] font-bold" style={{ color: T.accentPrimary }}>
              {group.project.title}
            </span>
            <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>
              {doneCount}/{group.tasks.length}
            </span>
            <div
              className="h-1 flex-1 max-w-[120px] rounded-full overflow-hidden"
              style={{ backgroundColor: T.borderSoft }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width:
                    (group.tasks.length > 0 ? (doneCount / group.tasks.length) * 100 : 0) +
                    "%",
                  backgroundColor: T.success,
                }}
              />
            </div>
          </button>
        </td>
      </tr>
      {!isCollapsed &&
        group.tasks.map((task, i) => (
          <TaskTr
            key={task.id}
            task={task}
            odd={i % 2 === 1}
            cellBorder={cellBorder}
            isTimerActive={activeTimerTaskId === task.id}
            pending={pendingId === task.id}
            statuses={statusesByProject[task.project.id]}
            onEnsureStatuses={() => onEnsureStatuses(task.project.id)}
            onOpen={() => onOpenDrawer(task.id)}
            onStartTimer={() => onStartTimer(task.id)}
            onStopTimer={onStopTimer}
            onMarkDone={() => onMarkDone(task)}
            onPatch={onPatch}
          />
        ))}
    </>
  );
}

function TaskTr({
  task,
  odd,
  cellBorder,
  isTimerActive,
  pending,
  statuses,
  onEnsureStatuses,
  onOpen,
  onStartTimer,
  onStopTimer,
  onMarkDone,
  onPatch,
}: {
  task: TaskItem;
  odd: boolean;
  cellBorder: string;
  isTimerActive: boolean;
  pending: boolean;
  statuses: TaskStatus[] | undefined;
  onEnsureStatuses: () => void;
  onOpen: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onMarkDone: () => void;
  onPatch?: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  const overdue = isOverdue(task);
  const bg = isTimerActive
    ? T.accentPrimarySoft
    : odd
      ? T.panelSoft
      : T.panel;
  const td = (last?: boolean): React.CSSProperties => ({
    borderRight: last ? undefined : cellBorder,
    borderBottom: cellBorder,
    padding: "8px 12px",
    verticalAlign: "middle",
    backgroundColor: bg,
  });

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors hover:brightness-[0.98]"
      style={{
        borderLeft: isTimerActive
          ? "3px solid " + T.accentPrimary
          : overdue
            ? "3px solid #ef4444"
            : "3px solid transparent",
      }}
    >
      {/* Left accent column to host marker */}
      <td style={td()} />

      {/* Priority */}
      <td style={{ ...td(), textAlign: "center" }}>
        {onPatch && statuses !== undefined ? (
          <PriorityPicker
            current={task.priority}
            onChange={(p) => onPatch(task.id, { priority: p })}
          />
        ) : (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            title={PRIORITY_LABEL[task.priority]}
            style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
          />
        )}
      </td>

      {/* Title */}
      <td style={td()}>
        <span
          className="text-[13px] font-medium"
          style={{
            color: task.status.isDone ? T.textMuted : T.textPrimary,
            textDecoration: task.status.isDone ? "line-through" : undefined,
          }}
        >
          {task.title}
          {task._count.subtasks > 0 && (
            <span className="ml-1.5 text-[10px] font-normal" style={{ color: T.textMuted }}>
              ({task._count.subtasks})
            </span>
          )}
        </span>
      </td>

      {/* Project */}
      <td style={td()}>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {task.project.title}
        </span>
      </td>

      {/* Assignees */}
      <td style={td()} onClick={(e) => e.stopPropagation()}>
        <div className="flex -space-x-1.5">
          {(task.assignees || []).slice(0, 3).map((a) =>
            a.user ? (
              <UserAvatar
                key={a.id}
                src={a.user.avatar}
                name={a.user.name}
                userId={a.user.id}
                size={24}
              />
            ) : (
              <ExternalAssigneeChip key={a.id} name={a.externalName ?? ""} />
            ),
          )}
          {(task.assignees || []).length > 3 && (
            <span
              className="inline-flex items-center justify-center rounded-full h-6 w-6 text-[9px] font-bold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textMuted,
                border: "1px solid " + T.borderSoft,
              }}
            >
              +{(task.assignees || []).length - 3}
            </span>
          )}
          {(!task.assignees || task.assignees.length === 0) && (
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              —
            </span>
          )}
        </div>
      </td>

      {/* Labels */}
      <td style={td()}>
        <div className="flex gap-1 overflow-hidden">
          {task.labels.slice(0, 2).map((l) => (
            <span
              key={l.label.id}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold truncate max-w-[60px]"
              style={{
                backgroundColor: l.label.color + "20",
                color: l.label.color,
              }}
            >
              {l.label.name}
            </span>
          ))}
          {task.labels.length === 0 && (
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              —
            </span>
          )}
          {task.labels.length > 2 && (
            <span className="text-[9px] font-medium" style={{ color: T.textMuted }}>
              +{task.labels.length - 2}
            </span>
          )}
        </div>
      </td>

      {/* Status */}
      <td style={td()} onClick={(e) => e.stopPropagation()}>
        {onPatch ? (
          <LazyStatusCell
            task={task}
            statuses={statuses}
            onEnsureStatuses={onEnsureStatuses}
            onChange={(sid) => onPatch(task.id, { statusId: sid })}
          />
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold inline-block"
            style={{
              backgroundColor: task.status.color + "20",
              color: task.status.color,
            }}
          >
            {task.status.name}
          </span>
        )}
      </td>

      {/* Due date */}
      <td style={td()} onClick={(e) => e.stopPropagation()}>
        {onPatch ? (
          <DueDatePicker
            current={task.dueDate}
            overdue={overdue}
            onChange={(iso) => onPatch(task.id, { dueDate: iso })}
          />
        ) : (
          <span
            className="text-[11px] font-medium"
            style={{ color: overdue ? "#ef4444" : T.textMuted }}
          >
            {task.dueDate
              ? new Date(task.dueDate).toLocaleDateString("uk-UA", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : "—"}
          </span>
        )}
      </td>

      {/* Actions */}
      <td
        style={td(true)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1 justify-end">
          {isTimerActive ? (
            <button
              onClick={onStopTimer}
              disabled={pending}
              title="Зупинити таймер"
              className="rounded-md p-1.5 disabled:opacity-50"
              style={{ backgroundColor: "#ef4444", color: "#fff" }}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              onClick={onStartTimer}
              disabled={pending || task.status.isDone}
              title="Старт таймера"
              className="rounded-md p-1.5 disabled:opacity-30"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <Play size={12} />
            </button>
          )}
          {!task.status.isDone && (
            <button
              onClick={onMarkDone}
              disabled={pending}
              title="Виконано"
              className="rounded-md p-1.5 disabled:opacity-50"
              style={{ backgroundColor: "#10b98122", color: "#10b981" }}
            >
              <CheckCircle2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Status pill, який lazy-fetch'ить statuses проєкту при першому кліку. */
function LazyStatusCell({
  task,
  statuses,
  onEnsureStatuses,
  onChange,
}: {
  task: TaskItem;
  statuses: TaskStatus[] | undefined;
  onEnsureStatuses: () => void;
  onChange: (statusId: string) => void;
}) {
  // Кожен раз коли pill mount-иться, тригернемо preload, але через useEffect
  // що runs once (statuses=undefined). Це дешево: один fetch на проєкт.
  useEffect(() => {
    if (statuses === undefined) onEnsureStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list: InlineStatus[] =
    statuses?.map((s) => ({ id: s.id, name: s.name, color: s.color })) ?? [];

  return (
    <InlineStatusPicker
      current={{ id: task.status.id, name: task.status.name, color: task.status.color }}
      statuses={list.length > 0 ? list : [
        { id: task.status.id, name: task.status.name, color: task.status.color },
      ]}
      onChange={onChange}
      size="sm"
    />
  );
}

function PriorityPicker({
  current,
  onChange,
}: {
  current: TaskItem["priority"];
  onChange: (p: TaskItem["priority"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      ref={wrapRef}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded-full transition hover:brightness-110 mx-auto"
        style={{ backgroundColor: PRIORITY_COLOR[current] + "33" }}
        title={`Пріоритет: ${PRIORITY_LABEL[current]}`}
      >
        <Flag size={10} style={{ color: PRIORITY_COLOR[current] }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-1 flex min-w-[150px] flex-col gap-0.5 rounded-xl p-1 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {PRIORITY_ORDER.map((p) => {
            const active = p === current;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (!active) onChange(p);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition hover:brightness-110"
                style={{
                  backgroundColor: active
                    ? PRIORITY_COLOR[p] + "22"
                    : "transparent",
                  color: active ? PRIORITY_COLOR[p] : T.textPrimary,
                }}
              >
                <Flag size={10} style={{ color: PRIORITY_COLOR[p] }} />
                <span className="flex-1">{PRIORITY_LABEL[p]}</span>
                {active && <span style={{ color: PRIORITY_COLOR[p] }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DueDatePicker({
  current,
  overdue,
  onChange,
}: {
  current: string | null;
  overdue: boolean;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const due = current ? new Date(current) : null;
  const valueStr = due ? due.toISOString().slice(0, 10) : "";
  const label = due
    ? due.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })
    : "—";
  const color = !due
    ? T.textMuted
    : overdue
      ? "#ef4444"
      : T.accentPrimary;

  return (
    <div
      ref={wrapRef}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold transition hover:brightness-110"
        style={{
          backgroundColor: due ? color + "20" : "transparent",
          color,
          border: `1px solid ${due ? color + "55" : T.borderSoft}`,
        }}
        title={due ? `Дедлайн: ${due.toLocaleDateString("uk-UA")}` : "Призначити дедлайн"}
      >
        <CalendarPlus size={11} />
        {label}
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 flex flex-col gap-2 rounded-xl p-2 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <input
            type="date"
            value={valueStr}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v ? new Date(v + "T00:00:00").toISOString() : null);
              setOpen(false);
            }}
            className="rounded-lg px-2 py-1.5 text-[12px] outline-none"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          />
          {due && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textMuted,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              Прибрати дату
            </button>
          )}
        </div>
      )}
    </div>
  );
}
