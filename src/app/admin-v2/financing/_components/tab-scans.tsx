"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Search,
  FileText,
  Paperclip,
  Calendar,
  TrendingDown,
  TrendingUp,
  ImageOff,
  ExternalLink,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { FinanceEntryDTO } from "./types";
import { FINANCE_STATUS_LABELS, FINANCE_STATUS_COLORS } from "./types";

type TypeFilter = "all" | "EXPENSE" | "INCOME";

export function TabScans({
  entries,
  loading,
  error,
  onEdit,
}: {
  entries: FinanceEntryDTO[];
  loading: boolean;
  error: string | null;
  onEdit: (e: FinanceEntryDTO) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Show only entries with attachments (scans) from FACT kind
  const scanEntries = useMemo(() => {
    return entries.filter((e) => e.attachments.length > 0 && e.kind === "FACT");
  }, [entries]);

  const filteredScans = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scanEntries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (!needle) return true;
      const haystack = [
        e.title,
        e.description ?? "",
        e.counterparty ?? "",
        e.category,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [scanEntries, search, typeFilter]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
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

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук в назві, описі, контрагенті…"
            className="w-full rounded-xl pl-9 pr-3 py-2.5 text-[13px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </div>
        <div className="flex gap-1.5">
          <FilterChip
            active={typeFilter === "all"}
            label={`Всі (${scanEntries.length})`}
            onClick={() => setTypeFilter("all")}
          />
          <FilterChip
            active={typeFilter === "EXPENSE"}
            label="Витрати"
            icon={<TrendingDown size={11} />}
            color={T.danger}
            onClick={() => setTypeFilter("EXPENSE")}
          />
          <FilterChip
            active={typeFilter === "INCOME"}
            label="Доходи"
            icon={<TrendingUp size={11} />}
            color={T.success}
            onClick={() => setTypeFilter("INCOME")}
          />
        </div>
      </div>

      {/* Results */}
      {filteredScans.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-16 text-center rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
        >
          <FileText size={28} />
          <span className="text-[13px]">
            {search || typeFilter !== "all"
              ? "Немає сканів за обраними фільтрами"
              : "Немає сканованих чеків"}
          </span>
          <span className="text-[11px]">
            Використайте "Scan чек з AI" щоб додати чек з фото
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredScans.map((entry) => (
            <ScanCard key={entry.id} entry={entry} onEdit={() => onEdit(entry)} />
          ))}
        </div>
      )}

      <div className="text-[11px] text-center" style={{ color: T.textMuted }}>
        Показано {filteredScans.length} з {scanEntries.length} сканів
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  icon,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition"
      style={{
        backgroundColor: active ? (color ?? T.accentPrimary) : T.panelSoft,
        color: active ? "#fff" : T.textMuted,
        border: `1px solid ${active ? (color ?? T.accentPrimary) : T.borderSoft}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ScanCard({
  entry,
  onEdit,
}: {
  entry: FinanceEntryDTO;
  onEdit: () => void;
}) {
  const amount = Number(entry.amount);
  const isIncome = entry.type === "INCOME";
  const amountColor = isIncome ? T.success : T.danger;
  const primaryAttachment = entry.attachments[0];

  return (
    <div
      onClick={onEdit}
      className="cursor-pointer rounded-2xl overflow-hidden transition hover:brightness-[0.97]"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {/* Image preview */}
      <div
        className="relative h-48 overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: T.panelSoft }}
      >
        {primaryAttachment && primaryAttachment.mimeType.startsWith("image/") ? (
          <AttachmentImage
            entryId={entry.id}
            attachmentId={primaryAttachment.id}
            alt={primaryAttachment.originalName}
          />
        ) : primaryAttachment ? (
          <div className="flex flex-col items-center gap-2" style={{ color: T.textMuted }}>
            <FileText size={36} style={{ color: T.accentPrimary }} />
            <span className="text-[11px] px-4 text-center truncate max-w-full">
              {primaryAttachment.originalName}
            </span>
          </div>
        ) : (
          <ImageOff size={28} style={{ color: T.textMuted }} />
        )}

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold inline-flex items-center gap-0.5"
            style={{
              backgroundColor: isIncome ? T.successSoft : T.dangerSoft,
              color: amountColor,
            }}
          >
            {isIncome ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {isIncome ? "ДОХІД" : "ВИТРАТА"}
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${FINANCE_STATUS_COLORS[entry.status]}`}
          >
            {FINANCE_STATUS_LABELS[entry.status]}
          </span>
        </div>

        {entry.attachments.length > 1 && (
          <span
            className="absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-0.5"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
          >
            <Paperclip size={9} /> {entry.attachments.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold line-clamp-2 flex-1" style={{ color: T.textPrimary }}>
            {entry.title}
          </span>
          <span className="text-[14px] font-bold whitespace-nowrap" style={{ color: amountColor }}>
            {isIncome ? "+" : "−"}
            {formatCurrency(amount)}
          </span>
        </div>

        {entry.counterparty && (
          <div className="text-[11px] truncate" style={{ color: T.textSecondary }}>
            🏢 {entry.counterparty}
          </div>
        )}

        {entry.description && (
          <div className="text-[11px] line-clamp-3 whitespace-pre-line" style={{ color: T.textMuted }}>
            {entry.description}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: T.borderSoft }}>
          <span className="flex items-center gap-1 text-[10px]" style={{ color: T.textMuted }}>
            <Calendar size={10} />
            {formatDateShort(entry.occurredAt)}
          </span>
          {entry.project && (
            <span className="text-[10px] truncate" style={{ color: T.textMuted }}>
              {entry.project.title}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: T.accentPrimary }}
          >
            Відкрити <ExternalLink size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentImage({
  entryId,
  attachmentId,
  alt,
}: {
  entryId: string;
  attachmentId: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/financing/${entryId}/attachments/${attachmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.url) setUrl(data.url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [entryId, attachmentId]);

  if (failed) {
    return <ImageOff size={28} style={{ color: T.textMuted }} />;
  }
  if (!url) {
    return <Loader2 size={20} className="animate-spin" style={{ color: T.textMuted }} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
