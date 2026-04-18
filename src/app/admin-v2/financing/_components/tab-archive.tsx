"use client";

import { Archive, Loader2, AlertCircle, Edit, RotateCcw, Paperclip } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { useFinancingData } from "./use-financing-data";
import type { FinanceEntryDTO, ProjectOption, UserOption } from "./types";

export function TabArchive({
  scope,
  projects,
  users,
  onEdit,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  users: UserOption[];
  onEdit: (e: FinanceEntryDTO) => void;
}) {
  const { entries, loading, error } = useFinancingData({
    scope,
    overrideArchived: true,
  });

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо архів…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <AlertCircle size={32} style={{ color: T.danger }} />
        <span className="text-[14px]" style={{ color: T.danger }}>{error}</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Archive size={32} style={{ color: T.textMuted }} />
        <span className="text-[13px]" style={{ color: T.textMuted }}>Архів порожній</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Archive size={14} style={{ color: T.textMuted }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          АРХІВОВАНІ ЗАПИСИ ({entries.length})
        </span>
      </div>

      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="max-h-[600px] overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="group flex items-center gap-3 border-b px-4 py-3 hover:brightness-[0.97]"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                opacity: 0.75,
              }}
            >
              <div className="text-[11px] font-mono flex-shrink-0 w-16" style={{ color: T.textMuted }}>
                {formatDateShort(entry.occurredAt)}
              </div>

              <span
                className="rounded-md px-1.5 py-0.5 text-[9px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: entry.kind === "PLAN" ? T.accentPrimarySoft : T.successSoft,
                  color: entry.kind === "PLAN" ? T.accentPrimary : T.success,
                }}
              >
                {entry.kind === "PLAN" ? "ПЛАН" : "ФАКТ"}
              </span>

              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold truncate" style={{ color: T.textPrimary }}>
                  {entry.title}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: T.textMuted }}>
                  <span>{FINANCE_CATEGORY_LABELS[entry.category] ?? entry.category}</span>
                  {entry.project && (
                    <>
                      <span>·</span>
                      <span>{entry.project.title}</span>
                    </>
                  )}
                  {entry.attachments.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Paperclip size={9} />
                        {entry.attachments.length}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div
                className="text-[13px] font-bold whitespace-nowrap flex-shrink-0"
                style={{ color: entry.type === "INCOME" ? T.success : T.danger }}
              >
                {entry.type === "INCOME" ? "+" : "−"}{formatCurrency(Number(entry.amount))}
              </div>

              <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(entry)}
                  title="Переглянути"
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textSecondary,
                    border: `1px solid ${T.borderStrong}`,
                  }}
                >
                  <Edit size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
