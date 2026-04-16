"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CalendarTask = {
  id: string;
  title: string;
  dueDate: string | null;
  status: { name: string; color: string };
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
};

const PRIORITY_COLOR: Record<CalendarTask["priority"], string> = {
  LOW: "#64748b",
  NORMAL: "#3b82f6",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export function TaskCalendar({
  tasks,
  onOpen,
}: {
  tasks: CalendarTask[];
  onOpen: (id: string) => void;
}) {
  const [cursor, setCursor] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, CalendarTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const k = format(new Date(t.dueDate), "yyyy-MM-dd");
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [tasks]);

  const monthLabel = format(cursor, "LLLL yyyy", { locale: uk });

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="rounded-lg p-2"
          style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
        >
          <ChevronLeft size={16} />
        </button>
        <h3
          className="text-[14px] font-bold uppercase"
          style={{ color: T.textPrimary }}
        >
          {monthLabel}
        </h3>
        <button
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-lg p-2"
          style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
          <div
            key={d}
            className="text-[10px] font-bold uppercase"
            style={{ color: T.textMuted }}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const items = tasksByDate.get(k) ?? [];
          const isCurrent = isSameMonth(d, cursor);
          const isToday = isSameDay(d, new Date());
          return (
            <div
              key={k}
              className="rounded-lg p-1.5 min-h-[80px] flex flex-col gap-0.5"
              style={{
                backgroundColor: isToday
                  ? T.accentPrimarySoft
                  : T.panelElevated,
                border: `1px solid ${isToday ? T.accentPrimary : T.borderSoft}`,
                opacity: isCurrent ? 1 : 0.5,
              }}
            >
              <div
                className="text-[10px] font-bold"
                style={{ color: isToday ? T.accentPrimary : T.textMuted }}
              >
                {format(d, "d")}
              </div>
              {items.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className="truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium"
                  style={{
                    backgroundColor: t.status.color + "22",
                    color: t.status.color,
                    borderLeft: `2px solid ${PRIORITY_COLOR[t.priority]}`,
                  }}
                  title={t.title}
                >
                  {t.title}
                </button>
              ))}
              {items.length > 3 && (
                <span
                  className="text-[9px] font-semibold"
                  style={{ color: T.textMuted }}
                >
                  +{items.length - 3}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
