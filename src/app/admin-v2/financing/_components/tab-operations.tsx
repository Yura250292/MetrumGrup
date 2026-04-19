"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Edit,
  Archive,
  Trash2,
  Paperclip,
  User,
  FileText,
  FolderOpen,
  FolderInput,
  AlignLeft,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import type { FinanceEntryDTO, FinancingFilters } from "./types";

type ChipKey =
  | "all"
  | "plan"
  | "fact"
  | "income"
  | "expense"
  | "no_project"
  | "with_files"
  | "no_files"
  | "overdue";

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "plan", label: "План" },
  { key: "fact", label: "Факт" },
  { key: "income", label: "Доходи" },
  { key: "expense", label: "Витрати" },
  { key: "no_project", label: "Без проєкту" },
  { key: "with_files", label: "З файлами" },
  { key: "no_files", label: "Без файлів" },
  { key: "overdue", label: "Прострочені" },
];

type SortField = "date" | "amount";
type SortDir = "asc" | "desc";

export function TabOperations({
  entries,
  loading,
  error,
  scope,
  filters,
  setFilters,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
}: {
  entries: FinanceEntryDTO[];
  loading: boolean;
  error: string | null;
  scope?: { id: string; title: string };
  filters: FinancingFilters;
  setFilters: React.Dispatch<React.SetStateAction<FinancingFilters>>;
  onEdit: (e: FinanceEntryDTO) => void;
  onArchive: (e: FinanceEntryDTO) => void;
  onDelete?: (e: FinanceEntryDTO) => void;
  onMoveToFolder?: (e: FinanceEntryDTO) => void;
}) {
  const [activeChips, setActiveChips] = useState<Set<ChipKey>>(new Set(["all"]));
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleChip(key: ChipKey) {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (key === "all") {
        return new Set(["all"]);
      }
      next.delete("all");
      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) next.add("all");
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const now = new Date();

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (!activeChips.has("all")) {
      result = result.filter((e) => {
        if (activeChips.has("plan") && e.kind !== "PLAN") return false;
        if (activeChips.has("fact") && e.kind !== "FACT") return false;
        if (activeChips.has("income") && e.type !== "INCOME") return false;
        if (activeChips.has("expense") && e.type !== "EXPENSE") return false;
        if (activeChips.has("no_project") && e.projectId !== null) return false;
        if (activeChips.has("with_files") && e.attachments.length === 0) return false;
        if (activeChips.has("no_files") && e.attachments.length > 0) return false;
        if (activeChips.has("overdue")) {
          if (e.kind !== "PLAN" || new Date(e.occurredAt) >= now) return false;
        }
        return true;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
      } else {
        cmp = Number(a.amount) - Number(b.amount);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [entries, activeChips, sortField, sortDir, now]);

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
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const active = activeChips.has(chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => toggleChip(chip.key)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
                color: active ? T.accentPrimary : T.textMuted,
                border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {/* Table header */}
        <div
          className="hidden lg:grid gap-0 border-b px-4 py-3"
          style={{
            gridTemplateColumns: "80px 60px 70px 1fr 120px 120px 120px 80px 60px",
            borderColor: T.borderSoft,
            backgroundColor: T.panelElevated,
          }}
        >
          <HeaderCell label="Дата" sortable field="date" current={sortField} dir={sortDir} onSort={toggleSort} />
          <HeaderCell label="Вид" />
          <HeaderCell label="Тип" />
          <HeaderCell label="Назва" />
          <HeaderCell label="Категорія" />
          {!scope && <HeaderCell label="Проєкт" />}
          <HeaderCell label="Сума" sortable field="amount" current={sortField} dir={sortDir} onSort={toggleSort} />
          <HeaderCell label="Якість" />
          <HeaderCell label="" />
        </div>

        {/* Rows */}
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center" style={{ color: T.textMuted }}>
            <FileText size={24} />
            <span className="text-[13px]">Немає записів за обраними фільтрами</span>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {filteredEntries.map((entry, i) => {
              const isOverdue = entry.kind === "PLAN" && new Date(entry.occurredAt) < now;
              return (
                <OperationRow
                  key={entry.id}
                  entry={entry}
                  isZebra={i % 2 === 1}
                  isOverdue={isOverdue}
                  showProject={!scope}
                  onEdit={() => onEdit(entry)}
                  onArchive={() => onArchive(entry)}
                  onDelete={onDelete ? () => onDelete(entry) : undefined}
                  onMoveToFolder={onMoveToFolder ? () => onMoveToFolder(entry) : undefined}
                />
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-4 py-2.5"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
        >
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {filteredEntries.length} {filteredEntries.length === 1 ? "запис" : "записів"}
          </span>
          {entries.length >= 500 && (
            <span className="text-[10px]" style={{ color: T.warning }}>
              Показано перші 500 — звузьте фільтри
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderCell({
  label,
  sortable,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortable?: boolean;
  field?: SortField;
  current?: SortField;
  dir?: SortDir;
  onSort?: (f: SortField) => void;
}) {
  const isActive = sortable && field === current;
  return (
    <button
      onClick={sortable && field ? () => onSort?.(field) : undefined}
      className="flex items-center gap-1 text-[10px] font-bold tracking-wider truncate"
      style={{ color: isActive ? T.accentPrimary : T.textMuted, cursor: sortable ? "pointer" : "default" }}
    >
      {label}
      {sortable && (
        <ArrowUpDown size={10} style={{ opacity: isActive ? 1 : 0.4 }} />
      )}
    </button>
  );
}

function OperationRow({
  entry,
  isZebra,
  isOverdue,
  showProject,
  onEdit,
  onArchive,
  onDelete,
  onMoveToFolder,
}: {
  entry: FinanceEntryDTO;
  isZebra: boolean;
  isOverdue: boolean;
  showProject: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete?: () => void;
  onMoveToFolder?: () => void;
}) {
  const amount = Number(entry.amount);
  const amountColor =
    entry.type === "INCOME" ? T.success : T.danger;

  return (
    <>
      {/* ═══ MOBILE card ═══ */}
      <div
        className="lg:hidden group border-b px-4 py-3"
        style={{
          borderColor: T.borderSoft,
          backgroundColor: isZebra ? T.panelSoft : "transparent",
          borderLeft: isOverdue ? `3px solid ${T.danger}` : "3px solid transparent",
        }}
      >
        {/* Row 1: badges + amount */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                backgroundColor: entry.kind === "PLAN" ? T.accentPrimarySoft : T.successSoft,
                color: entry.kind === "PLAN" ? T.accentPrimary : T.success,
              }}
            >
              {entry.kind === "PLAN" ? "ПЛАН" : "ФАКТ"}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                backgroundColor: entry.type === "INCOME" ? T.successSoft : T.dangerSoft,
                color: entry.type === "INCOME" ? T.success : T.danger,
              }}
            >
              {entry.type === "INCOME" ? "ДОХІД" : "ВИТРАТА"}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: T.danger }}>
                <Clock size={9} /> Простр.
              </span>
            )}
          </div>
          <span className="text-[14px] font-bold whitespace-nowrap" style={{ color: amountColor }}>
            {entry.type === "INCOME" ? "+" : "−"}{formatCurrency(amount)}
          </span>
        </div>

        {/* Row 2: title */}
        <div className="text-[13px] font-semibold truncate mb-0.5" style={{ color: T.textPrimary }}>
          {entry.title}
        </div>

        {/* Row 3: meta */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] truncate min-w-0" style={{ color: T.textMuted }}>
            <span className="font-mono">{formatDateShort(entry.occurredAt)}</span>
            <span>·</span>
            <span className="truncate">{FINANCE_CATEGORY_LABELS[entry.category] ?? entry.category}</span>
            {showProject && entry.project && (
              <>
                <span>·</span>
                <span className="truncate">{entry.project.title}</span>
              </>
            )}
            {entry.attachments.length > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5"><Paperclip size={8} />{entry.attachments.length}</span>
              </>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {onMoveToFolder && (
              <button
                onClick={onMoveToFolder}
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary, border: `1px solid ${T.accentPrimary}40` }}
                title="В папку"
              >
                <FolderInput size={12} />
              </button>
            )}
            <button
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: T.panelElevated, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}
            >
              <Edit size={12} />
            </button>
            <button
              onClick={onArchive}
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
            >
              <Archive size={12} />
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: T.danger, color: "#fff", border: `1px solid ${T.danger}` }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ DESKTOP row ═══ */}
      <div
        className="hidden lg:grid group gap-0 border-b px-4 py-3 hover:brightness-[0.97] transition"
        style={{
          gridTemplateColumns: showProject
            ? "80px 60px 70px 1fr 120px 120px 120px 80px 60px"
            : "80px 60px 70px 1fr 120px 120px 80px 60px",
          borderColor: T.borderSoft,
          backgroundColor: isZebra ? T.panelSoft : "transparent",
          borderLeft: isOverdue ? `3px solid ${T.danger}` : "3px solid transparent",
        }}
      >
        <div className="flex items-center">
          <span className="text-[11px] font-mono" style={{ color: T.textMuted }}>
            {formatDateShort(entry.occurredAt)}
          </span>
        </div>
        <div className="flex items-center">
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
            style={{
              backgroundColor: entry.kind === "PLAN" ? T.accentPrimarySoft : T.successSoft,
              color: entry.kind === "PLAN" ? T.accentPrimary : T.success,
            }}
          >
            {entry.kind === "PLAN" ? "ПЛАН" : "ФАКТ"}
          </span>
        </div>
        <div className="flex items-center">
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
            style={{
              backgroundColor: entry.type === "INCOME" ? T.successSoft : T.dangerSoft,
              color: entry.type === "INCOME" ? T.success : T.danger,
            }}
          >
            {entry.type === "INCOME" ? "ДОХІД" : "ВИТРАТА"}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[12.5px] font-semibold truncate" style={{ color: T.textPrimary }}>
            {entry.title}
          </span>
          {entry.counterparty && (
            <span className="text-[10px] truncate" style={{ color: T.textMuted }}>{entry.counterparty}</span>
          )}
          {isOverdue && (
            <span className="flex items-center gap-1 text-[9px] font-bold mt-0.5" style={{ color: T.danger }}>
              <Clock size={9} /> Прострочено
            </span>
          )}
        </div>
        <div className="flex items-center">
          <span className="text-[11px] truncate" style={{ color: T.textMuted }}>
            {FINANCE_CATEGORY_LABELS[entry.category] ?? entry.category}
          </span>
        </div>
        {showProject && (
          <div className="flex items-center">
            <span className="text-[11px] truncate" style={{ color: T.textMuted }}>
              {entry.project?.title ?? <em>Постійна</em>}
            </span>
          </div>
        )}
        <div className="flex items-center justify-end">
          <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: amountColor }}>
            {entry.type === "INCOME" ? "+" : "−"}{formatCurrency(amount)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <QualityDot icon={<Paperclip size={9} />} ok={entry.attachments.length > 0} title={entry.attachments.length > 0 ? `${entry.attachments.length} файл(ів)` : "Без файлів"} />
          <QualityDot icon={<User size={9} />} ok={!!entry.counterparty} title={entry.counterparty || "Без контрагента"} />
          <QualityDot icon={<AlignLeft size={9} />} ok={!!entry.description} title={entry.description ? "Є опис" : "Без опису"} />
          <QualityDot icon={<FolderOpen size={9} />} ok={!!entry.projectId} title={entry.project?.title || "Без проєкту"} />
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          {onMoveToFolder && (
            <button onClick={onMoveToFolder} title="В папку" className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary, border: `1px solid ${T.accentPrimary}40` }}>
              <FolderInput size={10} />
            </button>
          )}
          <button onClick={onEdit} title="Редагувати" className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: T.panelElevated, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}>
            <Edit size={10} />
          </button>
          <button onClick={onArchive} title="Архівувати" className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}>
            <Archive size={10} />
          </button>
          {onDelete && (
            <button onClick={onDelete} title="Видалити назавжди" className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: T.danger, color: "#fff", border: `1px solid ${T.danger}` }}>
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function QualityDot({
  icon,
  ok,
  title,
}: {
  icon: React.ReactNode;
  ok: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className="flex h-5 w-5 items-center justify-center rounded-full"
      style={{
        backgroundColor: ok ? T.successSoft : T.panelSoft,
        color: ok ? T.success : T.textMuted,
        opacity: ok ? 1 : 0.5,
      }}
    >
      {icon}
    </span>
  );
}
