"use client";

import Link from "next/link";
import { ChevronRight, Users, Sun, Cloud, CloudRain, Snowflake } from "lucide-react";

export interface TodaySectionData {
  tasksCount: number;
  tasksHint: string | null;
  crewPresent: number;
  crewTotal: number;
  crewName: string | null;
  weather: {
    temperatureC: number;
    label: string;
    kind: "sun" | "cloud" | "rain" | "snow";
  } | null;
}

interface TodaySectionProps {
  data: TodaySectionData;
  projectId: string | null;
}

const WEATHER_ICON = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: Snowflake,
};

export function TodaySection({ data, projectId }: TodaySectionProps) {
  const tasksHref = projectId ? `/foreman/report/project/${projectId}` : "/foreman/history";

  return (
    <section aria-labelledby="today-heading" className="space-y-3">
      <h2
        id="today-heading"
        className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500"
      >
        СЬОГОДНІ
      </h2>

      <Link
        href={tasksHref}
        className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-3 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50">
          <span className="text-[22px] font-extrabold text-indigo-600 leading-none tabular-nums">
            {data.tasksCount}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-slate-900">Задачі на сьогодні</div>
          <div className="text-[12px] text-slate-500 truncate">
            {data.tasksHint ?? "Перевірте список робіт"}
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-400 shrink-0" />
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-3">
          <Users size={18} className="text-emerald-600" />
          <div className="mt-2 text-[22px] font-extrabold text-slate-900 tabular-nums leading-none">
            {data.crewPresent} / {data.crewTotal}
          </div>
          <div className="mt-2 text-[12px] font-medium text-slate-600 truncate">
            {data.crewName ?? "Бригада"}
          </div>
        </div>

        {data.weather && (
          <div className="rounded-2xl bg-amber-100 p-3">
            <Weather kind={data.weather.kind} />
            <div className="mt-2 text-[22px] font-extrabold text-slate-900 tabular-nums leading-none">
              {data.weather.temperatureC > 0 ? "+" : ""}
              {data.weather.temperatureC}°
            </div>
            <div className="mt-2 text-[12px] font-medium text-amber-900 truncate">
              {data.weather.label}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Weather({ kind }: { kind: "sun" | "cloud" | "rain" | "snow" }) {
  const Icon = WEATHER_ICON[kind];
  return <Icon size={22} className="text-amber-600" />;
}
