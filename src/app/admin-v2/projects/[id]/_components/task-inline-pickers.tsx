"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, CalendarPlus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type TaskPriorityValue = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const PRIORITY_LABEL: Record<TaskPriorityValue, string> = {
  LOW: "Низький",
  NORMAL: "Звичайний",
  HIGH: "Високий",
  URGENT: "Терміновий",
};
export const PRIORITY_ORDER: TaskPriorityValue[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const PRIORITY_COLOR: Record<TaskPriorityValue, string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

/** Спільний хук закриття поповера по кліку поза/Escape. */
function useDismiss(open: boolean, close: () => void) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return wrapRef;
}

export function PriorityPicker({
  current,
  onChange,
}: {
  current: TaskPriorityValue;
  onChange: (p: TaskPriorityValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useDismiss(open, () => setOpen(false));

  return (
    <div ref={wrapRef} className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded-full transition hover:brightness-110"
        style={{ backgroundColor: PRIORITY_COLOR[current] + "33" }}
        title={`Пріоритет: ${PRIORITY_LABEL[current]}`}
      >
        <Flag size={11} style={{ color: PRIORITY_COLOR[current] }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-1 flex min-w-[150px] flex-col gap-0.5 rounded-xl p-1 shadow-lg"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
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
                  backgroundColor: active ? PRIORITY_COLOR[p] + "22" : "transparent",
                  color: active ? PRIORITY_COLOR[p] : T.textPrimary,
                }}
              >
                <Flag size={11} style={{ color: PRIORITY_COLOR[p] }} />
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

export function DueDatePicker({
  current,
  onChange,
}: {
  current: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useDismiss(open, () => setOpen(false));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = current ? new Date(current) : null;
  const overdue = due ? due.getTime() < today.getTime() : false;
  const valueStr = due ? due.toISOString().slice(0, 10) : "";
  const label = due
    ? due.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })
    : "Додати дату";
  const color = !due ? T.textMuted : overdue ? T.danger ?? "#ef4444" : T.accentPrimary;

  return (
    <div ref={wrapRef} className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:brightness-110"
        style={{
          backgroundColor: due ? color + "22" : "transparent",
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
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <input
            type="date"
            value={valueStr}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) onChange(null);
              else onChange(new Date(v + "T00:00:00").toISOString());
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
