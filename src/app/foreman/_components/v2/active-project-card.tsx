"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";

export interface ActiveProjectInfo {
  id: string;
  code: string | null;
  title: string;
  address: string | null;
  stageName: string | null;
  daysLeft: number | null;
}

interface ActiveProjectCardProps {
  project: ActiveProjectInfo | null;
}

export function ActiveProjectCard({ project }: ActiveProjectCardProps) {
  if (!project) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 text-center">
        <div className="text-sm font-semibold text-slate-700">Немає активного проєкту</div>
        <div className="text-xs text-slate-500 mt-1">
          Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/foreman/report/project/${project.id}`}
      className="block rounded-2xl bg-slate-900 p-4 text-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.55)] active:scale-[0.99] transition-transform"
    >
      <div className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-2.5 py-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
        <span className="text-[9px] font-extrabold tracking-[0.1em] text-emerald-400">
          ВИ ТУТ ЗАРАЗ
        </span>
      </div>

      {project.code && (
        <div className="mt-3 text-[10px] font-extrabold tracking-[0.1em] text-slate-400">
          {project.code}
        </div>
      )}

      <div className="mt-1 text-[20px] font-bold leading-tight truncate" title={project.title}>
        {project.title}
      </div>

      {project.address && (
        <div className="mt-2 flex items-center gap-1.5 text-slate-300">
          <MapPin size={12} />
          <span className="text-xs truncate">{project.address}</span>
        </div>
      )}

      {project.stageName && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-slate-400 shrink-0">Поточний етап:</span>
            <span className="text-[11px] font-semibold text-white truncate">
              {project.stageName}
            </span>
          </div>
          {project.daysLeft !== null && (
            <span
              className={`text-[11px] font-bold tabular-nums shrink-0 ${
                project.daysLeft < 0 ? "text-rose-400" : "text-amber-400"
              }`}
            >
              {project.daysLeft < 0
                ? `${Math.abs(project.daysLeft)} дн ⊕`
                : `${project.daysLeft} дн`}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
