"use client";

import { Check, Sparkles } from "lucide-react";

interface SupplierSummaryCardProps {
  /** Назва підтвердженого постачальника або null. */
  supplierName: string | null;
  /** AI-guess коли postачальник не привʼязаний. */
  supplierGuess: string | null;
  /** К-сть unique постачальників серед усіх items — для info. */
  uniqueCount: number;
}

export function SupplierSummaryCard({
  supplierName,
  supplierGuess,
  uniqueCount,
}: SupplierSummaryCardProps) {
  if (!supplierName && !supplierGuess) return null;
  const isMulti = uniqueCount > 1;

  return (
    <div className="rounded-xl bg-white border border-slate-200 px-3 py-3">
      <div className="text-[9px] font-extrabold tracking-[0.1em] text-slate-400 uppercase">
        ПОСТАЧАЛЬНИК
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[14px] font-semibold text-slate-900 truncate">
          {supplierName ?? supplierGuess}
        </span>
        {supplierName ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-extrabold">
            <Check size={10} strokeWidth={3} />в базі
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-extrabold">
            <Sparkles size={10} strokeWidth={2.5} />новий
          </span>
        )}
      </div>
      {isMulti && (
        <div className="mt-1 text-[11px] text-slate-500">
          + ще {uniqueCount - 1}{" "}
          {uniqueCount - 1 === 1 ? "постачальник" : "постачальників"} у позиціях нижче
        </div>
      )}
    </div>
  );
}
