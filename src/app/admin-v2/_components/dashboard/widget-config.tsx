"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Check } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const STORAGE_KEY = "dashboard-widget-config";

export const WIDGET_DEFS = [
  { id: "hero", label: "Hero / Привітання" },
  { id: "ai-summary", label: "AI підсумок дня" },
  { id: "attention", label: "Потребує уваги" },
  { id: "kpi-business", label: "KPI бізнес" },
  { id: "kpi-tasks", label: "KPI задачі" },
  { id: "finance", label: "Фінансова аналітика" },
  { id: "stages", label: "Етапи проєктів" },
  { id: "team", label: "Team Pulse" },
  { id: "activity", label: "Активність" },
  { id: "projects-risk", label: "Проєкти з ризиками" },
  { id: "utility", label: "Бічна панель" },
  { id: "ai-widget", label: "AI Інсайти" },
] as const;

export type WidgetId = (typeof WIDGET_DEFS)[number]["id"];

const ALL_WIDGET_IDS = WIDGET_DEFS.map((w) => w.id);

export function loadWidgetConfig(): Set<WidgetId> {
  if (typeof window === "undefined") return new Set(ALL_WIDGET_IDS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(ALL_WIDGET_IDS);
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((id) => ALL_WIDGET_IDS.includes(id as WidgetId)) as WidgetId[]);
  } catch {
    return new Set(ALL_WIDGET_IDS);
  }
}

function saveWidgetConfig(visible: Set<WidgetId>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
}

export function WidgetConfig({
  visible,
  onChange,
}: {
  visible: Set<WidgetId>;
  onChange: (next: Set<WidgetId>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (id: WidgetId) => {
    const next = new Set(visible);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    saveWidgetConfig(next);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-[0.95]"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <Settings size={14} />
        <span className="hidden sm:inline">Налаштувати</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl p-2 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="mb-2 px-2">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ВИДИМІ СЕКЦІЇ
            </span>
          </div>
          {WIDGET_DEFS.map((w) => {
            const isVisible = visible.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition hover:brightness-[0.97]"
                style={{
                  backgroundColor: isVisible ? T.accentPrimary + "08" : "transparent",
                  color: isVisible ? T.textPrimary : T.textMuted,
                }}
              >
                <div
                  className="flex h-4 w-4 items-center justify-center rounded flex-shrink-0"
                  style={{
                    backgroundColor: isVisible ? T.accentPrimary : "transparent",
                    border: `1.5px solid ${isVisible ? T.accentPrimary : T.textMuted}`,
                  }}
                >
                  {isVisible && <Check size={10} color="#fff" />}
                </div>
                {w.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
