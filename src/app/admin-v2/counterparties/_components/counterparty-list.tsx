"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExcelImportModal } from "@/app/admin-v2/hr/_components/excel-import-modal";

type CounterpartyType = "LEGAL" | "INDIVIDUAL" | "FOP";

type Counterparty = {
  id: string;
  name: string;
  type: CounterpartyType;
  edrpou: string | null;
  iban: string | null;
  vatPayer: boolean;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  type: CounterpartyType;
  edrpou: string;
  taxId: string;
  iban: string;
  vatPayer: boolean;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "LEGAL",
  edrpou: "",
  taxId: "",
  iban: "",
  vatPayer: false,
  phone: "",
  email: "",
  address: "",
  notes: "",
  isActive: true,
};

const TYPE_LABELS: Record<CounterpartyType, string> = {
  LEGAL: "ТОВ",
  INDIVIDUAL: "Фіз. особа",
  FOP: "ФОП",
};

const TYPE_COLORS: Record<CounterpartyType, { bg: string; fg: string }> = {
  LEGAL: { bg: T.skySoft, fg: T.sky },
  FOP: { bg: T.amberSoft, fg: T.amber },
  INDIVIDUAL: { bg: T.violetSoft, fg: T.violet },
};

function taxLabel(type: CounterpartyType): string {
  return type === "LEGAL" ? "ЄДРПОУ" : "РНОКПП";
}

export function CounterpartyList({ currentUserRole }: { currentUserRole: string }) {
  const canCreate = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"].includes(currentUserRole);

  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | CounterpartyType>("");
  const [showInactive, setShowInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("take", "200");
      if (showInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/admin/financing/counterparties?${params}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setItems(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.edrpou ?? "").toLowerCase().includes(needle) ||
        (c.taxId ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, search, typeFilter]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setError(null);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.name.trim()) {
      setError("Назва обовʼязкова");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        edrpou: form.edrpou.trim() || null,
        taxId: form.taxId.trim() || null,
        iban: form.iban.trim() || null,
        vatPayer: form.vatPayer,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      };
      const res = await fetch(`/api/admin/financing/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка створення");
        return;
      }
      // Show in list immediately, then navigate to dossier so operator can fill
      // remaining fields (notes, etc) and see the empty timeline.
      setItems((prev) => [j.data, ...prev.filter((c) => c.id !== j.data.id)]);
      resetForm();
      window.location.href = `/admin-v2/counterparties/${j.data.id}`;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Building2 size={20} style={{ color: T.textPrimary }} />
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Контрагенти
        </h1>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {filtered.length}
          {filtered.length !== items.length ? ` / ${items.length}` : ""}
        </span>
        <div className="flex-1" />
        {canCreate && (
          <>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{
                backgroundColor: T.panelSoft,
                color: T.accentPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <Upload size={13} /> Імпорт з Excel
            </button>
            <button
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              <Plus size={13} /> Новий контрагент
            </button>
          </>
        )}
      </div>

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Імпорт контрагентів"
        templateUrl="/api/admin/financing/counterparties/template"
        importUrl="/api/admin/financing/counterparties/import"
        previewColumns={[
          { key: "name", label: "Назва" },
          { key: "type", label: "Тип" },
          { key: "taxId", label: "Код" },
          { key: "phone", label: "Телефон" },
          { key: "email", label: "Email" },
          { key: "address", label: "Адреса" },
        ]}
        onImported={() => {
          void load();
        }}
      />

      {showForm && (
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.accentPrimary}40` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Новий контрагент
            </h3>
            <button onClick={resetForm} aria-label="Скасувати">
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Назва" required>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
                required
              />
            </Field>
            <Field label="Тип">
              <div className="flex gap-2">
                {(["LEGAL", "FOP", "INDIVIDUAL"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, type: t }))}
                    className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{
                      backgroundColor: form.type === t ? T.accentPrimarySoft : T.panelSoft,
                      color: form.type === t ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${form.type === t ? T.borderAccent : T.borderStrong}`,
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={taxLabel(form.type)}>
              <input
                value={form.edrpou}
                onChange={(e) => setForm((p) => ({ ...p, edrpou: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="ІПН (якщо інший)">
              <input
                value={form.taxId}
                onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="IBAN">
              <input
                value={form.iban}
                onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))}
                placeholder="UA..."
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="Платник ПДВ?">
              <label
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
              >
                <input
                  type="checkbox"
                  checked={form.vatPayer}
                  onChange={(e) => setForm((p) => ({ ...p, vatPayer: e.target.checked }))}
                />
                <span className="text-sm" style={{ color: T.textPrimary }}>
                  {form.vatPayer ? "Так" : "Ні"}
                </span>
              </label>
            </Field>
            <Field label="Телефон">
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Адреса">
                <input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
            </div>

            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2 text-[12px]"
                style={{
                  backgroundColor: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.danger}40`,
                }}
              >
                {error}
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl px-4 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Додати і відкрити досьє
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук — назва / ЄДРПОУ / телефон / email…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["", "LEGAL", "FOP", "INDIVIDUAL"] as const).map((t) => (
            <button
              key={t || "all"}
              onClick={() => setTypeFilter(t)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: typeFilter === t ? T.accentPrimary : T.panelSoft,
                color: typeFilter === t ? "#fff" : T.textSecondary,
                border: `1px solid ${typeFilter === t ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {t === "" ? "Всі" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label
          className="flex items-center gap-1.5 text-[12px] cursor-pointer"
          style={{ color: T.textSecondary }}
        >
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Показати деактивованих
        </label>
      </div>

      {loading && (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm"
          style={{ color: T.textMuted }}
        >
          <Loader2 size={16} className="animate-spin" /> Завантажуємо…
        </div>
      )}

      {!loading && (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-3 py-3 text-left">Тип</th>
                <th className="px-3 py-3 text-left">Код</th>
                <th className="px-3 py-3 text-left">Контакти</th>
                <th className="px-3 py-3 text-right">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const tc = TYPE_COLORS[c.type];
                return (
                  <tr
                    key={c.id}
                    className="border-t transition hover:bg-black/5"
                    style={{ borderColor: T.borderSoft, opacity: c.isActive ? 1 : 0.55 }}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin-v2/counterparties/${c.id}`}
                        className="font-medium hover:underline"
                        style={{ color: T.textPrimary }}
                      >
                        {c.name}
                      </Link>
                      {c.vatPayer && (
                        <span
                          className="ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{ backgroundColor: T.violetSoft, color: T.violet }}
                        >
                          ПДВ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: tc.bg, color: tc.fg }}
                      >
                        {TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {c.edrpou ?? c.taxId ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      <div className="flex flex-col gap-0.5">
                        {c.phone && <span>{c.phone}</span>}
                        {c.email && <span>{c.email}</span>}
                        {!c.phone && !c.email && <span style={{ color: T.textMuted }}>—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {c.isActive ? (
                        <CheckCircle2 size={14} style={{ color: T.success }} />
                      ) : (
                        <XCircle size={14} style={{ color: T.textMuted }} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                    {search.trim() || typeFilter
                      ? "Нічого не знайдено за фільтрами."
                      : "Список порожній. Додайте через кнопку «Новий контрагент» або імпортуйте з Excel."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
        {required && <span style={{ color: T.danger }}> *</span>}
      </span>
      {children}
    </label>
  );
}
