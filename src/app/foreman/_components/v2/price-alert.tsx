"use client";

import { TrendingUp } from "lucide-react";

interface PriceAlertProps {
  title: string;
  detail?: string;
  /** Positive number = ціна зросла на N%. */
  changePct?: number;
}

export function PriceAlert({ title, detail, changePct }: PriceAlertProps) {
  const headline = changePct != null
    ? `${title} ${changePct > 0 ? "+" : ""}${changePct}%`
    : title;

  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-xl bg-rose-50 px-4 py-3 pl-5"
    >
      <span
        className="absolute left-0 inset-y-0 w-[3px] rounded-r bg-rose-600"
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <TrendingUp size={16} className="text-rose-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-900">{headline}</div>
          {detail && <div className="text-[11px] text-rose-900/80 leading-snug mt-0.5">{detail}</div>}
        </div>
      </div>
    </div>
  );
}
