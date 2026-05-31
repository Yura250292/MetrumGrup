"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./frappe-gantt-vendor.css";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type GanttItem = {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string;
  progress: number;
  dependencies: string;
  custom_class?: string;
  _meta?: {
    status: string;
    statusColor: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    isDone: boolean;
    checklistCount: number;
    /** true якщо таск згенерований з рядка кошторису (auto-from-estimate). */
    isAutoFromEstimate?: boolean;
    sourceEstimateItemId?: string | null;
  };
};

type ViewMode = "Day" | "Week" | "Month" | "Year";

type FrappeGanttInstance = {
  refresh: (tasks: GanttItem[]) => void;
  change_view_mode: (mode: ViewMode) => void;
};

type FrappeGanttCtor = new (
  element: HTMLElement | SVGElement,
  tasks: GanttItem[],
  options: Record<string, unknown>,
) => FrappeGanttInstance;

export function TaskGantt({
  items,
  tasksWithoutDates = [],
  onTaskClick,
  onDateChange,
  projectId,
}: {
  items: GanttItem[];
  /** Задачі без startDate/dueDate — показуємо їх окремим списком над
   *  Gantt, щоб не зникали мовчки. Клік відкриває drawer задачі. */
  tasksWithoutDates?: {
    id: string;
    title: string;
    status: { name: string; color: string };
  }[];
  onTaskClick: (id: string) => void;
  onDateChange: (id: string, start: Date, end: Date) => void;
  /** Якщо передано — у toolbar з'являються кнопки Експорт XML/CSV та
   *  Заморозити baseline. */
  projectId?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<FrappeGanttInstance | null>(null);
  const [mode, setMode] = useState<ViewMode>("Week");
  const [busy, setBusy] = useState<null | "freeze" | "clear">(null);

  // Snapshot of items — re-render gantt when items or mode change
  const itemsKey = useMemo(
    () => items.map((t) => `${t.id}:${t.start}:${t.end}:${t.progress}`).join("|"),
    [items],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    if (items.length === 0) {
      hostRef.current.innerHTML = "";
      ganttRef.current = null;
      return;
    }

    let cancelled = false;
    const el = hostRef.current;
    el.innerHTML = "";

    (async () => {
      const mod = await import("frappe-gantt");
      if (cancelled || !hostRef.current) return;
      const Ctor = (mod.default ?? mod) as unknown as FrappeGanttCtor;
      try {
        const gantt = new Ctor(el, items, {
          view_mode: mode,
          language: "uk",
          bar_height: 24,
          padding: 18,
          on_click: (task: GanttItem) => onTaskClick(task.id),
          on_date_change: (task: GanttItem, start: Date, end: Date) => {
            onDateChange(task.id, start, end);
          },
        });
        ganttRef.current = gantt;
      } catch (err) {
        console.error("[frappe-gantt] init failed", err);
      }
    })();

    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
      ganttRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, mode]);

  if (items.length === 0 && tasksWithoutDates.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Немає задач у проєкті.
      </div>
    );
  }

  if (items.length === 0) {
    // Тільки задачі без дат — Gantt малювати немає чого, але показуємо
    // список «без дат» щоб користувач міг призначити дати кліком.
    return (
      <NoDatesBanner tasks={tasksWithoutDates} onTaskClick={onTaskClick} standalone />
    );
  }

  async function doFreeze() {
    if (!projectId) return;
    if (!confirm("Зафіксувати baseline для всіх задач проєкту? Після цього зміни планових дат потребуватимуть розморозки.")) return;
    setBusy("freeze");
    try {
      const r = await fetch(
        `/api/admin/projects/${projectId}/baseline/freeze`,
        { method: "POST" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Не вдалось зафіксувати baseline");
      } else {
        const j = await r.json();
        alert(`Baseline зафіксовано (${j.data?.tasksFrozen ?? 0} задач).`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function doClear() {
    if (!projectId) return;
    if (!confirm("Розморозити baseline? Це дозволить редагувати планові дати без обмежень.")) return;
    setBusy("clear");
    try {
      const r = await fetch(
        `/api/admin/projects/${projectId}/baseline/clear`,
        { method: "POST" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Не вдалось розморозити baseline");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {tasksWithoutDates.length > 0 && (
        <NoDatesBanner tasks={tasksWithoutDates} onTaskClick={onTaskClick} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {(["Day", "Week", "Month"] as ViewMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                {m === "Day" ? "День" : m === "Week" ? "Тиждень" : "Місяць"}
              </button>
            );
          })}
        </div>
        <Legend />
        {projectId && (
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/api/admin/projects/${projectId}/gantt/export.xml`}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: T.panel,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
              title="MS Project XML"
            >
              ↓ XML
            </a>
            <a
              href={`/api/admin/projects/${projectId}/gantt/export.csv`}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: T.panel,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
              title="CSV для Excel/Google Sheets"
            >
              ↓ CSV
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void doFreeze()}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
              style={{
                backgroundColor: T.accentPrimarySoft,
                color: T.accentPrimary,
              }}
              title="Зафіксувати поточні дати як план (baseline)"
            >
              {busy === "freeze" ? "…" : "Заморозити baseline"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void doClear()}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
              style={{
                backgroundColor: T.panel,
                color: T.textMuted,
                border: `1px solid ${T.borderSoft}`,
              }}
              title="Розморозити baseline (дозволити редагування планових дат)"
            >
              {busy === "clear" ? "…" : "Розморозити"}
            </button>
          </div>
        )}
      </div>
      <div
        className="metrum-gantt rounded-2xl overflow-x-auto"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          padding: 8,
        }}
      >
        <div ref={hostRef} />
        <style jsx global>{`
          .metrum-gantt .gantt .bar {
            fill: ${T.accentPrimary};
          }
          .metrum-gantt .gantt .bar-progress {
            fill: #10b981;
          }
          .metrum-gantt .gantt .bar-label {
            fill: #fff;
            font-weight: 600;
          }
          .metrum-gantt .gantt .critical .bar {
            fill: #ef4444 !important;
          }
          .metrum-gantt .gantt .critical .bar-progress {
            fill: #fca5a5 !important;
          }
          .metrum-gantt .gantt .grid-header {
            fill: ${T.panelElevated};
          }
          .metrum-gantt .gantt .grid-row {
            fill: transparent;
          }
          .metrum-gantt .gantt .grid-row:nth-child(even) {
            fill: rgba(255, 255, 255, 0.02);
          }
          .metrum-gantt .gantt .tick {
            stroke: ${T.borderSoft};
          }
          .metrum-gantt .gantt .today-highlight {
            fill: ${T.accentPrimary};
            opacity: 0.08;
          }
          .metrum-gantt .gantt .lower-text,
          .metrum-gantt .gantt .upper-text {
            fill: ${T.textMuted};
            font-weight: 600;
          }
          .metrum-gantt .gantt .arrow {
            stroke: ${T.textMuted};
          }
          .metrum-gantt .gantt .critical .arrow {
            stroke: #ef4444;
          }
          /* Auto-from-estimate: задача згенерована з рядка кошторису через
             syncEstimateItemsToTasks. Бар отримує синю штрих-обвідку, щоб
             візуально відрізнити від manual-задач. */
          .metrum-gantt .gantt .auto-from-estimate .bar {
            stroke: ${T.accentPrimary} !important;
            stroke-width: 1.5 !important;
            stroke-dasharray: 4 2 !important;
          }
        `}</style>
      </div>
    </div>
  );
}

function NoDatesBanner({
  tasks,
  onTaskClick,
  standalone = false,
}: {
  tasks: { id: string; title: string; status: { name: string; color: string } }[];
  onTaskClick: (id: string) => void;
  standalone?: boolean;
}) {
  const [expanded, setExpanded] = useState(standalone);
  const visible = expanded ? tasks : tasks.slice(0, 0);
  return (
    <div
      className="rounded-2xl p-3"
      style={{
        backgroundColor: standalone ? T.panel : T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textPrimary }}>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: "#f59e0b22", color: "#f59e0b" }}
          >
            {tasks.length}
          </span>
          <span className="font-semibold">
            {standalone
              ? "Задач без дат — призначте, щоб побачити на Gantt"
              : "задач без дат — не показані на таймлайні"}
          </span>
        </div>
        {!standalone && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{
              backgroundColor: T.panel,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            {expanded ? "Згорнути" : "Показати"}
          </button>
        )}
      </div>
      {(expanded || standalone) && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {(standalone ? tasks : visible).map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onTaskClick(t.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition hover:brightness-110"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
                  style={{
                    backgroundColor: t.status.color + "22",
                    color: t.status.color,
                  }}
                >
                  {t.status.name}
                </span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[11px]" style={{ color: T.accentPrimary }}>
                  Призначити дати →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px]" style={{ color: T.textMuted }}>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded"
          style={{ backgroundColor: T.accentPrimary }}
        />
        Звичайна
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded"
          style={{ backgroundColor: "#ef4444" }}
        />
        Критичний шлях
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded"
          style={{ backgroundColor: "#10b981" }}
        />
        Виконано
      </span>
    </div>
  );
}
