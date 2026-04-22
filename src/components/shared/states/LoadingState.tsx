"use client";

import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  label?: string;
  variant?: "spinner" | "skeleton-list" | "skeleton-cards";
  rows?: number;
};

export function LoadingState({ label = "Завантаження...", variant = "spinner", rows = 4 }: Props) {
  if (variant === "skeleton-list") {
    return (
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        aria-busy="true"
        aria-label={label}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: i === 0 ? undefined : `1px solid ${T.borderSoft}` }}
          >
            <SkeletonBar widthClass="w-1/3" />
            <SkeletonBar widthClass="w-1/4" />
            <div className="flex-1" />
            <SkeletonBar widthClass="w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "skeleton-cards") {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5" aria-busy="true" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="aspect-[16/9] animate-pulse" style={{ backgroundColor: T.panelElevated }} />
            <div className="flex flex-col gap-2 p-4">
              <SkeletonBar widthClass="w-3/4" />
              <SkeletonBar widthClass="w-1/2" />
              <SkeletonBar widthClass="w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-12"
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 size={22} className="animate-spin" style={{ color: T.textMuted }} />
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        {label}
      </span>
    </div>
  );
}

function SkeletonBar({ widthClass }: { widthClass: string }) {
  return (
    <div
      className={`h-3 rounded animate-pulse ${widthClass}`}
      style={{ backgroundColor: T.panelElevated }}
    />
  );
}
