"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Building2,
  Search,
  Phone,
  Mail,
  MapPin,
  Loader2,
  X,
  Pencil,
  Trash2,
  Hash,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type CounterpartyType = "LEGAL" | "INDIVIDUAL" | "FOP";

type Counterparty = {
  id: string;
  name: string;
  type: CounterpartyType;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  name: string;
  type: CounterpartyType;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "LEGAL",
  taxId: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  isActive: true,
};

const TYPE_LABEL: Record<CounterpartyType, string> = {
  LEGAL: "Юрособа",
  INDIVIDUAL: "Фізособа",
  FOP: "ФОП",
};

function taxLabel(type: CounterpartyType): string {
  return type === "LEGAL" ? "ЄДРПОУ" : "ІПН";
}

export default function HrCounterpartiesPage() {
  const [items, setItems] = useState<Counterparty[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/hr/counterparties")
      .then((r) => r.json())
      .then((d) => setItems(d.data || []))
      .catch(() => setError("Не вдалось завантажити"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = items.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.taxId?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.toLowerCase().includes(q) ?? false) ||
      (c.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const activeCount = items.filter((c) => c.isActive).length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function openEdit(c: Counterparty) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      taxId: c.taxId ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
      isActive: c.isActive,
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      taxId: form.taxId.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    };
    try {
      const res = await fetch("/api/admin/hr/counterparties", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Помилка збереження");
      }
      const { data } = await res.json();
      setItems((prev) =>
        editingId ? prev.map((c) => (c.id === editingId ? data : c)) : [...prev, data]
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити контрагента?")) return;
    const res = await fetch(`/api/admin/hr/counterparties?id=${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            HR
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Контрагенти
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {items.length} записів · {activeCount} активних
          </p>
        </div>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати контрагента
        </button>
      </section>

      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              {editingId ? "Редагувати контрагента" : "Новий контрагент"}
            </h3>
            <button onClick={resetForm}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="Назва"
              required
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ТИП
              </span>
              <div className="flex gap-2">
                {(["LEGAL", "INDIVIDUAL", "FOP"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, type: t }))}
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
                    style={{
                      backgroundColor:
                        form.type === t ? T.accentPrimarySoft : T.panelSoft,
                      color: form.type === t ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${form.type === t ? T.borderAccent : T.borderStrong}`,
                    }}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </label>
            <FormInput
              label={taxLabel(form.type)}
              value={form.taxId}
              onChange={(v) => setForm((p) => ({ ...p, taxId: v }))}
            />
            <FormInput
              label="Телефон"
              value={form.phone}
              onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
            />
            <FormInput
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            />
            <FormInput
              label="Адреса"
              value={form.address}
              onChange={(v) => setForm((p) => ({ ...p, address: v }))}
            />
            <label className="sm:col-span-2 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                КОМЕНТАР
              </span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </label>
            <label className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              <span className="text-sm" style={{ color: T.textSecondary }}>
                Активний
              </span>
            </label>
            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2.5 text-xs"
                style={{
                  backgroundColor: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.danger}`,
                }}
              >
                {error}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {editingId ? "Зберегти" : "Додати"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={16} style={{ color: T.textMuted }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за назвою, кодом, контактами…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: T.textPrimary }}
        />
      </div>

      <section className="flex flex-col gap-2">
        {fetching ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
            style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl py-12 text-center"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <Building2 size={28} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              {search ? "Нічого не знайдено" : "Контрагентів ще немає"}
            </span>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-2xl p-4"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <Building2 size={18} style={{ color: T.accentPrimary }} />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[14px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                    >
                      {TYPE_LABEL[c.type]}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        backgroundColor: c.isActive ? T.successSoft : T.panelElevated,
                        color: c.isActive ? T.success : T.textMuted,
                      }}
                    >
                      {c.isActive ? "Активний" : "Неактивний"}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-3 text-[11px] flex-wrap"
                    style={{ color: T.textMuted }}
                  >
                    {c.taxId && (
                      <span className="flex items-center gap-1">
                        <Hash size={11} /> {taxLabel(c.type)}: {c.taxId}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail size={11} /> {c.email}
                      </span>
                    )}
                    {c.address && (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {c.address}
                      </span>
                    )}
                  </div>
                  {c.notes && (
                    <span className="text-[12px]" style={{ color: T.textSecondary }}>
                      {c.notes}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded-lg px-2 py-1"
                    style={{ color: T.textMuted }}
                    title="Редагувати"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="rounded-lg px-2 py-1"
                    style={{ color: T.danger }}
                    title="Видалити"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function FormInput({
  label,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="rounded-xl px-3.5 py-3 text-sm outline-none"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      />
    </label>
  );
}
