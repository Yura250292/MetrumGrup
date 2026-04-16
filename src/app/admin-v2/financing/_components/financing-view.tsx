"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Download,
  Loader2,
  Search,
  Edit,
  Archive,
  Paperclip,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  FileText,
  CircleDot,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  FINANCE_CATEGORIES,
  FINANCE_CATEGORY_LABELS,
} from "@/lib/constants";
import { EntryFormModal, type EntryFormValues } from "./entry-form-modal";

export type FinanceEntryDTO = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  projectId: string | null;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  counterparty: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string; slug: string } | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    r2Key: string;
    createdAt: string;
  }>;
};

export type QuadrantStats = { sum: number; count: number };

export type FinanceSummaryDTO = {
  plan: { income: QuadrantStats; expense: QuadrantStats };
  fact: { income: QuadrantStats; expense: QuadrantStats };
  balance: number;
  count: number;
};

export type ProjectOption = { id: string; title: string };

const EMPTY_SUMMARY: FinanceSummaryDTO = {
  plan: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  fact: { income: { sum: 0, count: 0 }, expense: { sum: 0, count: 0 } },
  balance: 0,
  count: 0,
};

type QuadrantPreset = {
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
};

export function FinancingView({
  scope,
  projects,
  currentUserId,
  currentUserName,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [entries, setEntries] = useState<FinanceEntryDTO[]>([]);
  const [summary, setSummary] = useState<FinanceSummaryDTO>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    projectId: scope ? scope.id : "",
    category: "",
    from: "",
    to: "",
    search: "",
  });

  const [editing, setEditing] = useState<FinanceEntryDTO | null>(null);
  const [createPreset, setCreatePreset] = useState<QuadrantPreset | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (scope) {
      p.set("projectId", scope.id);
    } else {
      if (filters.projectId === "__NULL__") p.set("projectId", "null");
      else if (filters.projectId) p.set("projectId", filters.projectId);
    }
    if (filters.category) p.set("category", filters.category);
    if (filters.from) p.set("from", new Date(filters.from).toISOString());
    if (filters.to) {
      const d = new Date(filters.to);
      d.setHours(23, 59, 59, 999);
      p.set("to", d.toISOString());
    }
    if (filters.search.trim()) p.set("search", filters.search.trim());
    return p.toString();
  }, [filters, scope]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/financing?${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Помилка завантаження");
      const json = await res.json();
      setEntries(json.data || []);
      setSummary(json.summary || EMPTY_SUMMARY);
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/financing/export?${query}`);
      if (!res.ok) throw new Error("Помилка експорту");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financing-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Не вдалося експортувати");
    } finally {
      setExporting(false);
    }
  }

  async function handleSave(values: EntryFormValues, andCreateAnother: boolean) {
    const isEdit = !!editing;
    const url = isEdit ? `/api/admin/financing/${editing!.id}` : `/api/admin/financing`;
    const method = isEdit ? "PATCH" : "POST";

    const payload: Record<string, unknown> = {
      type: values.type,
      kind: values.kind,
      amount: Number(values.amount),
      occurredAt: new Date(values.occurredAt).toISOString(),
      projectId: values.projectId || null,
      category: values.category,
      subcategory: values.subcategory || null,
      title: values.title.trim(),
      description: values.description || null,
      counterparty: values.counterparty || null,
      currency: "UAH",
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Помилка збереження");
    }
    const { data: saved } = await res.json();

    if (values.pendingFiles.length > 0 && saved?.id) {
      await uploadFilesToEntry(saved.id, values.pendingFiles);
    }

    await loadData();

    if (andCreateAnother && !isEdit) {
      setEditing(null);
    } else {
      setCreatePreset(null);
      setEditing(null);
    }
  }

  async function uploadFilesToEntry(entryId: string, files: File[]) {
    const presignRes = await fetch(
      `/api/admin/financing/${entryId}/attachments/presigned-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      }
    );
    if (!presignRes.ok) throw new Error("Не вдалося підготувати upload");
    const { presignedUrls } = await presignRes.json();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pu = presignedUrls[i];
      const putRes = await fetch(pu.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": pu.contentType },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
    }

    await fetch(`/api/admin/financing/${entryId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: files.map((f, i) => ({
          r2Key: presignedUrls[i].key,
          originalName: f.name,
          mimeType: f.type || "application/octet-stream",
          size: f.size,
        })),
      }),
    });
  }

  async function handleArchive(entry: FinanceEntryDTO) {
    if (!confirm(`Архівувати запис «${entry.title}»?`)) return;
    const res = await fetch(`/api/admin/financing/${entry.id}`, { method: "DELETE" });
    if (res.ok) await loadData();
  }

  const resetFilters = () => {
    setFilters({
      projectId: scope ? scope.id : "",
      category: "",
      from: "",
      to: "",
      search: "",
    });
  };

  const quadrantEntries = useMemo(() => {
    const result: Record<string, FinanceEntryDTO[]> = {
      "PLAN:EXPENSE": [],
      "PLAN:INCOME": [],
      "FACT:EXPENSE": [],
      "FACT:INCOME": [],
    };
    for (const e of entries) {
      const key = `${e.kind}:${e.type}`;
      if (result[key]) result[key].push(e);
    }
    return result;
  }, [entries]);

  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.balance;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      {!scope && (
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ФАКТ І ПЛАН РУХУ ГРОШЕЙ
            </span>
            <h1
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: T.textPrimary }}
            >
              Фінансування
            </h1>
            <p className="text-[15px]" style={{ color: T.textSecondary }}>
              Плануйте витрати й доходи, вносьте фактичні операції, бачте баланс у реальному часі
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Експорт в Excel
            </button>
          </div>
        </section>
      )}

      {scope && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>
              Фінансування проєкту
            </h2>
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              План і факт по «{scope.title}»
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold disabled:opacity-50"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Excel
          </button>
        </div>
      )}

      {/* Global balance strip */}
      <section
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl p-3 sm:p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <SummaryStat
          label="ПЛАН БАЛАНС"
          value={formatCurrency(planBalance)}
          accent={planBalance >= 0 ? T.accentPrimary : T.warning}
          icon={<CircleDot size={12} />}
        />
        <SummaryStat
          label="ФАКТ БАЛАНС"
          value={formatCurrency(factBalance)}
          accent={factBalance >= 0 ? T.success : T.danger}
          icon={<Wallet size={12} />}
        />
        <SummaryStat
          label="ЗАВЕРШЕННЯ ПЛАНУ (ДОХ.)"
          value={formatPercent(summary.fact.income.sum, summary.plan.income.sum)}
          accent={T.textPrimary}
        />
        <SummaryStat
          label="ЗАВЕРШЕННЯ ПЛАНУ (ВИТР.)"
          value={formatPercent(summary.fact.expense.sum, summary.plan.expense.sum)}
          accent={T.textPrimary}
        />
      </section>

      {/* Filters */}
      <section
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: T.textMuted }} />
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ФІЛЬТРИ
          </span>
          <button
            onClick={resetFilters}
            className="ml-auto text-[11px]"
            style={{ color: T.accentPrimary }}
          >
            Скинути
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {!scope && (
            <FilterSelect
              value={filters.projectId}
              onChange={(v) => setFilters((p) => ({ ...p, projectId: v }))}
            >
              <option value="">Всі проєкти</option>
              <option value="__NULL__">Постійні витрати</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </FilterSelect>
          )}
          <FilterSelect
            value={filters.category}
            onChange={(v) => setFilters((p) => ({ ...p, category: v }))}
          >
            <option value="">Всі категорії</option>
            {FINANCE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </FilterSelect>
          <FilterInput
            type="date"
            value={filters.from}
            onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
            placeholder="Від"
          />
          <FilterInput
            type="date"
            value={filters.to}
            onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
            placeholder="До"
          />
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: T.textMuted }}
            />
            <input
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              placeholder="Пошук…"
              className="w-full rounded-xl pl-9 pr-3 py-2.5 text-[13px] outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            />
          </div>
        </div>
      </section>

      {/* 2x2 grid of quadrants */}
      {loading ? (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          <Loader2 size={16} className="animate-spin" /> Завантажуємо…
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <AlertCircle size={32} style={{ color: T.danger }} />
          <span className="text-[14px]" style={{ color: T.danger }}>
            {error}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuadrantCard
            title="Планові витрати"
            icon={<TrendingDown size={16} />}
            accent={T.warning}
            stats={summary.plan.expense}
            entries={quadrantEntries["PLAN:EXPENSE"]}
            onAdd={() => setCreatePreset({ kind: "PLAN", type: "EXPENSE" })}
            onEdit={(e) => setEditing(e)}
            onArchive={handleArchive}
            showProject={!scope}
            planned
          />
          <QuadrantCard
            title="Планові доходи"
            icon={<TrendingUp size={16} />}
            accent={T.accentPrimary}
            stats={summary.plan.income}
            entries={quadrantEntries["PLAN:INCOME"]}
            onAdd={() => setCreatePreset({ kind: "PLAN", type: "INCOME" })}
            onEdit={(e) => setEditing(e)}
            onArchive={handleArchive}
            showProject={!scope}
            planned
          />
          <QuadrantCard
            title="Фактичні витрати"
            icon={<TrendingDown size={16} />}
            accent={T.danger}
            stats={summary.fact.expense}
            entries={quadrantEntries["FACT:EXPENSE"]}
            onAdd={() => setCreatePreset({ kind: "FACT", type: "EXPENSE" })}
            onEdit={(e) => setEditing(e)}
            onArchive={handleArchive}
            showProject={!scope}
          />
          <QuadrantCard
            title="Фактичні доходи"
            icon={<TrendingUp size={16} />}
            accent={T.success}
            stats={summary.fact.income}
            entries={quadrantEntries["FACT:INCOME"]}
            onAdd={() => setCreatePreset({ kind: "FACT", type: "INCOME" })}
            onEdit={(e) => setEditing(e)}
            onArchive={handleArchive}
            showProject={!scope}
          />
        </div>
      )}

      {(createPreset || editing) && (
        <EntryFormModal
          mode={editing ? "edit" : "create"}
          initial={editing}
          preset={createPreset ?? undefined}
          projects={projects}
          scope={scope}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => {
            setCreatePreset(null);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function QuadrantCard({
  title,
  icon,
  accent,
  stats,
  entries,
  onAdd,
  onEdit,
  onArchive,
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
            {formatCurrency(stats.sum)}
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
}: {
  entry: FinanceEntryDTO;
  accent: string;
  isZebra: boolean;
  showProject: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const amount = Number(entry.amount);
  return (
    <div
      className="group flex items-center gap-3 border-b px-4 py-3 hover:brightness-125"
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
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold tracking-wider truncate"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label}
      </span>
      <span
        className="text-base sm:text-xl font-bold truncate"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

function formatPercent(actual: number, planned: number): string {
  if (!planned || planned === 0) return "—";
  const pct = Math.round((actual / planned) * 100);
  return `${pct}%`;
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    >
      {children}
    </select>
  );
}

function FilterInput({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
        colorScheme: "dark",
      }}
    />
  );
}
