"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Download,
  Loader2,
  Search,
  X,
  Edit,
  Archive,
  Paperclip,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  FINANCE_CATEGORIES,
  FINANCE_CATEGORY_LABELS,
  FINANCE_ENTRY_TYPE_LABELS,
} from "@/lib/constants";
import { EntryFormModal, type EntryFormValues } from "./entry-form-modal";

export type FinanceEntryDTO = {
  id: string;
  occurredAt: string;
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

export type FinanceSummaryDTO = {
  income: number;
  expense: number;
  balance: number;
  count: number;
};

export type ProjectOption = { id: string; title: string };

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
  const [summary, setSummary] = useState<FinanceSummaryDTO>({
    income: 0,
    expense: 0,
    balance: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    projectId: scope ? scope.id : ("" as string),
    type: "",
    category: "",
    from: "",
    to: "",
    search: "",
  });

  const [editing, setEditing] = useState<FinanceEntryDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (scope) {
      p.set("projectId", scope.id);
    } else {
      if (filters.projectId === "__NULL__") p.set("projectId", "null");
      else if (filters.projectId) p.set("projectId", filters.projectId);
    }
    if (filters.type) p.set("type", filters.type);
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
      setSummary(json.summary || { income: 0, expense: 0, balance: 0, count: 0 });
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
      setCreating(true);
      setEditing(null);
    } else {
      setCreating(false);
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
      type: "",
      category: "",
      from: "",
      to: "",
      search: "",
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      {!scope && (
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span
              className="text-[11px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              ФАКТ РУХУ ГРОШЕЙ
            </span>
            <h1
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: T.textPrimary }}
            >
              Фінансування
            </h1>
            <p className="text-[15px]" style={{ color: T.textSecondary }}>
              Доходи, витрати, постійні витрати компанії та баланс по проєктах
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
            <button
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Plus size={16} /> Додати операцію
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
              Фактичні доходи та витрати, прив'язані до «{scope.title}»
            </p>
          </div>
          <div className="flex gap-2">
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
            <button
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Plus size={14} /> Додати
            </button>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="ДОХОДИ"
          value={formatCurrency(summary.income)}
          icon={<TrendingUp size={14} />}
          accent={T.success}
        />
        <KpiCard
          label="ВИТРАТИ"
          value={formatCurrency(summary.expense)}
          icon={<TrendingDown size={14} />}
          accent={T.danger}
        />
        <KpiCard
          label="БАЛАНС"
          value={formatCurrency(summary.balance)}
          icon={<Wallet size={14} />}
          accent={summary.balance >= 0 ? T.success : T.danger}
        />
        <KpiCard
          label="ОПЕРАЦІЙ"
          value={String(summary.count)}
          accent={T.accentPrimary}
        />
      </section>

      {/* Filters */}
      <section
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: T.textMuted }} />
          <span
            className="text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
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
            value={filters.type}
            onChange={(v) => setFilters((p) => ({ ...p, type: v }))}
          >
            <option value="">Всі типи</option>
            <option value="INCOME">Дохід</option>
            <option value="EXPENSE">Витрата</option>
          </FilterSelect>
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

      {/* Table */}
      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-16 text-sm"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle size={32} style={{ color: T.danger }} />
            <span className="text-[14px]" style={{ color: T.danger }}>
              {error}
            </span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle size={32} style={{ color: T.textMuted }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Немає операцій
            </span>
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              Натисніть «Додати операцію», щоб створити першу
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>ДАТА</Th>
                  {!scope && <Th>ПРОЄКТ</Th>}
                  <Th>ТИП</Th>
                  <Th>КАТЕГОРІЯ</Th>
                  <Th>НАЗВА</Th>
                  <Th align="right">СУМА</Th>
                  <Th>ВІДПОВІДАЛЬНИЙ</Th>
                  <Th align="center">📎</Th>
                  <Th align="right">ДІЇ</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isExpense = e.type === "EXPENSE";
                  const sign = isExpense ? "−" : "+";
                  const amountColor = isExpense ? T.danger : T.success;
                  const amount = Number(e.amount);
                  return (
                    <tr
                      key={e.id}
                      style={{
                        backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <td
                        className="px-4 py-3.5 text-[12px] whitespace-nowrap"
                        style={{ color: T.textSecondary }}
                      >
                        {formatDateShort(e.occurredAt)}
                      </td>
                      {!scope && (
                        <td
                          className="px-4 py-3.5 text-[12px]"
                          style={{ color: T.textSecondary }}
                        >
                          {e.project?.title ?? (
                            <span style={{ color: T.textMuted, fontStyle: "italic" }}>
                              Постійна витрата
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <TypeBadge type={e.type} />
                      </td>
                      <td
                        className="px-4 py-3.5 text-[12px]"
                        style={{ color: T.textSecondary }}
                      >
                        {FINANCE_CATEGORY_LABELS[e.category] ?? e.category}
                      </td>
                      <td
                        className="px-4 py-3.5 text-[13px] font-semibold max-w-sm truncate"
                        style={{ color: T.textPrimary }}
                      >
                        {e.title}
                        {e.description && (
                          <div
                            className="text-[10px] font-normal truncate"
                            style={{ color: T.textMuted }}
                          >
                            {e.description}
                          </div>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right text-[13px] font-bold whitespace-nowrap"
                        style={{ color: amountColor }}
                      >
                        {sign} {formatCurrency(amount)}
                      </td>
                      <td
                        className="px-4 py-3.5 text-[11px]"
                        style={{ color: T.textMuted }}
                      >
                        {e.createdBy?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {e.attachments.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: T.accentPrimarySoft,
                              color: T.accentPrimary,
                            }}
                          >
                            <Paperclip size={10} />
                            {e.attachments.length}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <IconButton
                            onClick={() => {
                              setCreating(false);
                              setEditing(e);
                            }}
                            title="Редагувати"
                          >
                            <Edit size={12} />
                          </IconButton>
                          <IconButton
                            onClick={() => handleArchive(e)}
                            title="Архівувати"
                            danger
                          >
                            <Archive size={12} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <EntryFormModal
          mode={editing ? "edit" : "create"}
          initial={editing}
          projects={projects}
          scope={scope}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-3 sm:p-5 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span
        className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold tracking-wider truncate"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label}
      </span>
      <span
        className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function TypeBadge({ type }: { type: "INCOME" | "EXPENSE" }) {
  const isIncome = type === "INCOME";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
      style={{
        backgroundColor: isIncome ? T.successSoft : T.dangerSoft,
        color: isIncome ? T.success : T.danger,
      }}
    >
      {FINANCE_ENTRY_TYPE_LABELS[type]}
    </span>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:brightness-125"
      style={{
        backgroundColor: danger ? T.dangerSoft : T.panelElevated,
        color: danger ? T.danger : T.textSecondary,
        border: `1px solid ${danger ? T.danger : T.borderStrong}`,
      }}
    >
      {children}
    </button>
  );
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
