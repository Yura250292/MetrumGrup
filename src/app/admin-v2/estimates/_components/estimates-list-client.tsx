"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  FileText,
  Plus,
  Search,
  SearchX,
  Sparkles,
} from "lucide-react";
import type { EstimateStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";

export type EstimateRow = {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  createdAt: string;
  projectTitle: string | null;
  clientName: string | null;
};

export function EstimatesListClient({ estimates }: { estimates: EstimateRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return estimates;
    return estimates.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.number.toLowerCase().includes(q) ||
        (e.projectTitle ?? "").toLowerCase().includes(q) ||
        (e.clientName ?? "").toLowerCase().includes(q),
    );
  }, [estimates, query]);

  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2.5">
          <FileText size={18} style={{ color: T.accentPrimary }} />
          <span className="text-base font-bold" style={{ color: T.textPrimary }}>
            Всі кошториси
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
          >
            {filtered.length}
            {filtered.length !== estimates.length ? ` / ${estimates.length}` : ""}
          </span>
        </div>
        <div
          className="hidden md:flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
        >
          <Search size={14} style={{ color: T.textMuted }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук — назва / номер / проєкт / клієнт"
            className="w-64 bg-transparent text-xs outline-none placeholder:opacity-70"
            style={{ color: T.textPrimary }}
            aria-label="Пошук кошторисів"
          />
        </div>
      </div>

      {estimates.length === 0 ? (
        <EmptyAll />
      ) : filtered.length === 0 ? (
        <EmptySearch query={query} onClear={() => setQuery("")} />
      ) : (
        <div className="flex flex-col">
          {filtered.map((est, i) => (
            <Link
              key={est.id}
              href={`/admin-v2/estimates/${est.id}`}
              className="flex items-center gap-4 px-6 py-4 transition hover:brightness-[0.97]"
              style={{
                backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
              }}
            >
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: T.accentPrimarySoft }}
              >
                <Calculator size={20} style={{ color: T.accentPrimary }} />
              </div>
              <div className="flex flex-1 flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                    {est.title}
                  </span>
                  <StatusBadge status={est.status} />
                </div>
                <div className="flex items-center gap-2 text-[11px] flex-wrap" style={{ color: T.textMuted }}>
                  <span>{est.number}</span>
                  {est.projectTitle && (
                    <>
                      <span>·</span>
                      <span className="truncate">{est.projectTitle}</span>
                    </>
                  )}
                  {est.clientName && (
                    <>
                      <span>·</span>
                      <span className="truncate">{est.clientName}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{formatDateShort(est.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0 max-w-[40%] sm:max-w-none">
                <span className="text-sm sm:text-base font-bold truncate max-w-full" style={{ color: T.textPrimary }}>
                  {formatCurrency(est.finalAmount)}
                </span>
                {est.discount > 0 && (
                  <span className="text-[10px] line-through truncate max-w-full" style={{ color: T.textMuted }}>
                    {formatCurrency(est.totalAmount)}
                  </span>
                )}
              </div>
              <ArrowRight size={16} style={{ color: T.textMuted }} className="flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const label = ESTIMATE_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    SENT: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    APPROVED: { bg: T.successSoft, fg: T.success },
    REJECTED: { bg: T.dangerSoft, fg: T.danger },
    REVISION: { bg: T.warningSoft, fg: T.warning },
    ENGINEER_REVIEW: { bg: T.warningSoft, fg: T.warning },
    FINANCE_REVIEW: { bg: T.warningSoft, fg: T.warning },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function EmptyAll() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FileText size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Кошторисів ще немає
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший — швидко через AI або вручну
      </span>
      <div className="mt-3 flex gap-2">
        <Link
          href="/ai-estimate-v2"
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Sparkles size={16} /> AI генератор
        </Link>
        <Link
          href="/admin-v2/estimates/new"
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Plus size={16} /> Вручну
        </Link>
      </div>
    </div>
  );
}

function EmptySearch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.panelElevated }}
      >
        <SearchX size={28} style={{ color: T.textMuted }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Нічого не знайдено
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        За запитом «{query}» немає збігів по назві, номеру, проєкту чи клієнту.
      </span>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        Очистити пошук
      </button>
    </div>
  );
}
