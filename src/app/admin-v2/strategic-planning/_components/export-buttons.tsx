"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ForecastResult, Period } from "@/lib/strategic-planning/types";
import { exportToExcel, exportToPdf } from "./export";

export function ExportButtons({
  forecast,
  period,
}: {
  forecast: ForecastResult;
  period: Period;
}) {
  const disabled = forecast.rows.length === 0;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => exportToExcel(forecast, period)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all disabled:opacity-50"
        style={{
          borderColor: T.borderSoft,
          color: T.textPrimary,
          background: T.panel,
        }}
      >
        <FileSpreadsheet className="h-4 w-4" style={{ color: T.success }} />
        Excel
      </button>
      <button
        type="button"
        onClick={() => exportToPdf(forecast, period)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all disabled:opacity-50"
        style={{
          borderColor: T.borderSoft,
          color: T.textPrimary,
          background: T.panel,
        }}
      >
        <FileText className="h-4 w-4" style={{ color: T.danger }} />
        PDF
      </button>
    </div>
  );
}
