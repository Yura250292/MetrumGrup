"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Edit,
  Archive,
  Trash2,
  Paperclip,
  FileText,
  FolderInput,
  MoreVertical,
  ChevronDown,
  FileSpreadsheet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact, formatDateShort } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Collapsible } from "@/components/ui/Collapsible";
import type { FinanceEntryDTO, QuadrantStats } from "./types";

/** Track viewport once at mount — collapsed by default on <md */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return mobile;
}

export function QuadrantCard({
  title,
  icon,
  accent,
  stats,
  pairedSum,
  pairedLabel,
  entries,
  onAdd,
  onImport,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
  showProject,
  planned = false,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  stats: QuadrantStats;
  pairedSum?: number;
  pairedLabel?: string;
  entries: FinanceEntryDTO[];
  onAdd: () => void;
  onImport?: () => void;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
  showProject: boolean;
  planned?: boolean;
}) {
  // Ratio: how much of the "paired" side is realized through this card
  const ratioPct =
    typeof pairedSum === "number" && pairedSum > 0
      ? Math.min(
          200,
          Math.round(
            ((planned ? pairedSum : stats.sum) /
              (planned ? stats.sum : pairedSum)) *
              100,
          ),
        )
      : null;

  // On mobile, quadrants start collapsed to reduce vertical scroll.
  // Desktop shows them open.
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-md"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${planned ? T.borderSoft : T.borderStrong}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      {/* Header (click to toggle on mobile) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 border-b px-4 py-3.5 text-left w-full transition-colors hover:brightness-[0.98]"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {ratioPct !== null ? (
            <RadialProgress
              value={Math.min(100, ratioPct)}
              size={38}
              thickness={4}
              fillColor={accent}
              trackColor={`${accent}22`}
            >
              <span
                className="text-[10px] font-bold"
                style={{ color: accent }}
              >
                {ratioPct}%
              </span>
            </RadialProgress>
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
              style={{ backgroundColor: `${accent}1f`, color: accent }}
            >
              {icon}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              {planned && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: T.accentPrimary }}
                  title="План"
                />
              )}
              <span
                className="text-[13px] font-semibold tracking-tight truncate"
                style={{ color: T.textPrimary }}
              >
                {title}
              </span>
            </div>
            <span className="text-[10.5px]" style={{ color: T.textMuted }}>
              {stats.count} {stats.count === 1 ? "запис" : stats.count < 5 && stats.count !== 0 ? "записи" : "записів"}
              {pairedLabel && pairedSum !== undefined && (
                <>
                  {" · "}
                  {pairedLabel}: {formatCurrencyCompact(pairedSum)}
                </>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[15px] sm:text-base font-bold" style={{ color: accent }}>
            {formatCurrencyCompact(stats.sum)}
          </span>
          {onImport && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onImport();
              }}
              role="button"
              tabIndex={0}
              title="Імпорт з Excel"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onImport();
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-110 cursor-pointer"
              style={{
                backgroundColor: T.panelElevated,
                color: accent,
                border: `1px solid ${accent}40`,
              }}
            >
              <FileSpreadsheet size={13} />
            </span>
          )}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            role="button"
            tabIndex={0}
            title="Додати"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-110 cursor-pointer"
            style={{
              backgroundColor: accent,
              color: "#fff",
            }}
          >
            <Plus size={14} />
          </span>
          <ChevronDown
            size={16}
            className="transition-transform flex-shrink-0"
            style={{
              color: T.textMuted,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </button>

      {/* Collapsible list */}
      <Collapsible open={open} duration={320}>
        {entries.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-10 text-center px-6"
            style={{ color: T.textMuted }}
          >
            <FileText size={20} />
            <span className="text-[12px]">Порожньо</span>
            <button
              onClick={onAdd}
              className="mt-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{
                backgroundColor: `${accent}12`,
                color: accent,
              }}
            >
              + Додати перший запис
            </button>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                accent={accent}
                showProject={showProject}
                onEdit={() => onEdit(e)}
                onArchive={() => onArchive(e)}
                onDelete={onDelete ? () => onDelete(e) : undefined}
                onMoveToFolder={onMoveToFolder ? () => onMoveToFolder(e) : undefined}
              />
            ))}
          </div>
        )}
      </Collapsible>
    </section>
  );
}

function EntryRow({
  entry,
  accent,
  showProject,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
}: {
  entry: FinanceEntryDTO;
  accent: string;
  showProject: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete?: () => void;
  onMoveToFolder?: () => void;
}) {
  const amount = Number(entry.amount);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  const statusDot =
    entry.status === "PAID"
      ? T.success
      : entry.status === "APPROVED"
        ? T.accentPrimary
        : entry.status === "PENDING"
          ? T.warning
          : T.textMuted;

  return (
    <div
      className="group relative flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-[var(--t-panel-soft)]"
      style={{ borderColor: T.borderSoft }}
    >
      <div
        className="text-[11px] flex-shrink-0 w-14 tabular-nums"
        style={{ color: T.textMuted }}
      >
        {formatDateShort(entry.occurredAt)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusDot }}
            title={entry.status}
          />
          <span
            className="text-[12.5px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {entry.title}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 text-[10.5px] truncate"
          style={{ color: T.textMuted }}
        >
          <span>{FINANCE_CATEGORY_LABELS[entry.category] ?? entry.category}</span>
          {showProject && (
            <>
              <span>·</span>
              <span>
                {entry.project?.title ?? (
                  <em style={{ color: T.textMuted }}>Постійна</em>
                )}
              </span>
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
        className="text-[13px] font-bold whitespace-nowrap flex-shrink-0 tabular-nums"
        style={{ color: accent }}
      >
        {formatCurrency(amount)}
      </div>

      {/* Inline edit + kebab menu */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          title="Редагувати"
          className="flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textSecondary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Edit size={11} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title="Більше"
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[var(--t-panel-soft)]"
            style={{ color: T.textSecondary }}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-[180px] rounded-xl p-1 z-30"
              style={{
                backgroundColor: T.panelElevated,
                border: `1px solid ${T.borderStrong}`,
                boxShadow: "0 8px 24px -6px rgba(0,0,0,0.18)",
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-left hover:bg-[var(--t-panel-soft)] transition"
                style={{ color: T.textPrimary }}
              >
                <Edit size={12} /> Редагувати
              </button>
              {onMoveToFolder && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveToFolder();
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-left hover:bg-[var(--t-panel-soft)] transition"
                  style={{ color: T.textPrimary }}
                >
                  <FolderInput size={12} /> В папку
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-left hover:bg-[var(--t-panel-soft)] transition"
                style={{ color: T.textPrimary }}
              >
                <Archive size={12} /> Архівувати
              </button>
              {onDelete && (
                <>
                  <div
                    className="my-1 h-px"
                    style={{ backgroundColor: T.borderSoft }}
                  />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-left hover:bg-[var(--t-danger-soft)] transition"
                    style={{ color: T.danger }}
                  >
                    <Trash2 size={12} /> Видалити
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
