"use client";

import { Plus, Edit, Archive, Trash2, Paperclip, FileText, FolderInput } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact, formatDateShort } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { FinanceEntryDTO, QuadrantStats } from "./types";

export function QuadrantCard({
  title,
  icon,
  accent,
  stats,
  entries,
  onAdd,
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
  entries: FinanceEntryDTO[];
  onAdd: () => void;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
  showProject: boolean;
  planned?: boolean;
}) {
  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${planned ? T.borderSoft : T.borderStrong}`,
        opacity: planned ? 0.95 : 1,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            {icon}
          </span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[13px] font-bold tracking-tight truncate"
                style={{ color: T.textPrimary }}
              >
                {title}
              </span>
              {planned && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  ПЛАН
                </span>
              )}
            </div>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              {stats.count} {stats.count === 1 ? "запис" : stats.count < 5 ? "записи" : "записів"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[15px] sm:text-lg font-bold" style={{ color: accent }}>
            {formatCurrencyCompact(stats.sum)}
          </span>
          <button
            onClick={onAdd}
            title="Додати"
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: accent,
              color: "#fff",
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 py-10 text-center px-6"
          style={{ color: T.textMuted }}
        >
          <FileText size={22} />
          <span className="text-[12px]">Порожньо</span>
          <button
            onClick={onAdd}
            className="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              color: accent,
              border: `1px solid ${accent}`,
            }}
          >
            + Додати перший запис
          </button>
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {entries.map((e, i) => (
            <EntryRow
              key={e.id}
              entry={e}
              accent={accent}
              isZebra={i % 2 === 1}
              showProject={showProject}
              onEdit={() => onEdit(e)}
              onArchive={() => onArchive(e)}
              onDelete={onDelete ? () => onDelete(e) : undefined}
              onMoveToFolder={onMoveToFolder ? () => onMoveToFolder(e) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EntryRow({
  entry,
  accent,
  isZebra,
  showProject,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
}: {
  entry: FinanceEntryDTO;
  accent: string;
  isZebra: boolean;
  showProject: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete?: () => void;
  onMoveToFolder?: () => void;
}) {
  const amount = Number(entry.amount);
  return (
    <div
      className="group flex items-center gap-3 border-b px-4 py-3 hover:brightness-[0.97]"
      style={{
        borderColor: T.borderSoft,
        backgroundColor: isZebra ? T.panelSoft : "transparent",
      }}
    >
      <div
        className="text-[11px] font-mono flex-shrink-0 w-14"
        style={{ color: T.textMuted }}
      >
        {formatDateShort(entry.occurredAt)}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[12.5px] font-semibold truncate"
          style={{ color: T.textPrimary }}
        >
          {entry.title}
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] truncate"
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
        className="text-[13px] font-bold whitespace-nowrap flex-shrink-0"
        style={{ color: accent }}
      >
        {formatCurrency(amount)}
      </div>
      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        {onMoveToFolder && (
          <button
            onClick={onMoveToFolder}
            title="В папку"
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
              border: `1px solid ${T.accentPrimary}40`,
            }}
          >
            <FolderInput size={10} />
          </button>
        )}
        <button
          onClick={onEdit}
          title="Редагувати"
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textSecondary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Edit size={10} />
        </button>
        <button
          onClick={onArchive}
          title="Архівувати"
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <Archive size={10} />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Видалити назавжди"
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              backgroundColor: T.danger,
              color: "#fff",
              border: `1px solid ${T.danger}`,
            }}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
