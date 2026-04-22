"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Щось пішло не так",
  description,
  onRetry,
  retryLabel = "Спробувати ще раз",
}: Props) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-12 text-center"
      style={{
        backgroundColor: T.dangerSoft,
        border: `1px solid ${T.danger}30`,
      }}
      role="alert"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#FFFFFF", color: T.danger }}
      >
        <AlertTriangle size={22} />
      </div>
      <span className="text-[14px] font-semibold" style={{ color: T.danger }}>
        {title}
      </span>
      {description && (
        <span className="text-[12px] max-w-md" style={{ color: T.textSecondary }}>
          {description}
        </span>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition hover:brightness-95"
          style={{ backgroundColor: "#FFFFFF", color: T.danger, border: `1px solid ${T.danger}40` }}
        >
          <RotateCw size={14} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
