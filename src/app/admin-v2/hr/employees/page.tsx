"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Users,
  Search,
  Phone,
  Mail,
  Loader2,
  X,
  Pencil,
  Trash2,
  Briefcase,
  Upload,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExcelImportModal } from "../_components/excel-import-modal";

type SalaryType = "MONTHLY" | "HOURLY";

type Employee = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  salaryType: SalaryType;
  salaryAmount: number | string | null;
  currency: string;
  extraData: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  position: string;
  salaryType: SalaryType;
  salaryAmount: string;
  currency: string;
  extraData: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  fullName: "",
  phone: "",
  email: "",
  position: "",
  salaryType: "MONTHLY",
  salaryAmount: "",
  currency: "UAH",
  extraData: "",
  notes: "",
  isActive: true,
};

export default function HrEmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/hr/employees");
    const d = await r.json();
    setItems(d.data || []);
  }

  useEffect(() => {
    reload()
      .catch(() => setError("Не вдалось завантажити"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = items.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      (e.position?.toLowerCase().includes(q) ?? false) ||
      (e.phone?.toLowerCase().includes(q) ?? false) ||
      (e.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const activeCount = items.filter((e) => e.isActive).length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function openEdit(e: Employee) {
    setEditingId(e.id);
    setForm({
      fullName: e.fullName,
      phone: e.phone ?? "",
      email: e.email ?? "",
      position: e.position ?? "",
      salaryType: e.salaryType,
      salaryAmount: e.salaryAmount != null ? String(e.salaryAmount) : "",
      currency: e.currency,
      extraData: e.extraData ?? "",
      notes: e.notes ?? "",
      isActive: e.isActive,
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      position: form.position.trim() || null,
      salaryType: form.salaryType,
      salaryAmount: form.salaryAmount ? parseFloat(form.salaryAmount) : null,
      currency: form.currency || "UAH",
      extraData: form.extraData.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    };
    try {
      const res = await fetch("/api/admin/hr/employees", {
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
        editingId ? prev.map((e) => (e.id === editingId ? data : e)) : [...prev, data]
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити співробітника?")) return;
    const res = await fetch(`/api/admin/hr/employees?id=${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            HR
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Співробітники
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {items.length} карток · {activeCount} активних
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              color: T.accentPrimary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <Upload size={16} /> Імпорт з Excel
          </button>
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Plus size={16} /> Додати співробітника
          </button>
        </div>
      </section>

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Імпорт співробітників"
        templateUrl="/api/admin/hr/employees/template"
        importUrl="/api/admin/hr/employees/import"
        previewColumns={[
          { key: "fullName", label: "ПІБ" },
          { key: "position", label: "Посада" },
          { key: "phone", label: "Телефон" },
          { key: "email", label: "Email" },
          { key: "salaryType", label: "Тип ЗП" },
          { key: "salaryAmount", label: "Сума" },
          { key: "notes", label: "Коментар" },
        ]}
        onImported={() => {
          void reload();
        }}
      />

      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              {editingId ? "Редагувати співробітника" : "Новий співробітник"}
            </h3>
            <button onClick={resetForm}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="ПІБ"
              required
              value={form.fullName}
              onChange={(v) => setForm((p) => ({ ...p, fullName: v }))}
            />
            <FormInput
              label="Посада"
              value={form.position}
              onChange={(v) => setForm((p) => ({ ...p, position: v }))}
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
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ТИП ЗП
              </span>
              <div className="flex gap-2">
                {(["MONTHLY", "HOURLY"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, salaryType: t }))}
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
                    style={{
                      backgroundColor:
                        form.salaryType === t ? T.accentPrimarySoft : T.panelSoft,
                      color: form.salaryType === t ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${form.salaryType === t ? T.borderAccent : T.borderStrong}`,
                    }}
                  >
                    {t === "MONTHLY" ? "Місячна" : "Погодинна"}
                  </button>
                ))}
              </div>
            </label>
            <FormInput
              label={form.salaryType === "MONTHLY" ? "Сума на місяць, ₴" : "Ставка за годину, ₴"}
              type="number"
              value={form.salaryAmount}
              onChange={(v) => setForm((p) => ({ ...p, salaryAmount: v }))}
            />
            <FormInput
              label="Додаткові дані"
              value={form.extraData}
              onChange={(v) => setForm((p) => ({ ...p, extraData: v }))}
            />
            <FormInput
              label="Коментар"
              value={form.notes}
              onChange={(v) => setForm((p) => ({ ...p, notes: v }))}
            />
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
          placeholder="Пошук за ПІБ, посадою, телефоном…"
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
            <Users size={28} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              {search ? "Нічого не знайдено" : "Співробітників ще немає"}
            </span>
          </div>
        ) : (
          filtered.map((e) => {
            const amount = e.salaryAmount != null ? Number(e.salaryAmount) : null;
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-2xl p-4"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <Users size={18} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[14px] font-semibold truncate"
                        style={{ color: T.textPrimary }}
                      >
                        {e.fullName}
                      </span>
                      {e.position && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                        >
                          {e.position}
                        </span>
                      )}
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: e.isActive ? T.successSoft : T.panelElevated,
                          color: e.isActive ? T.success : T.textMuted,
                        }}
                      >
                        {e.isActive ? "Активний" : "Неактивний"}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 text-[11px] flex-wrap"
                      style={{ color: T.textMuted }}
                    >
                      {e.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {e.phone}
                        </span>
                      )}
                      {e.email && (
                        <span className="flex items-center gap-1">
                          <Mail size={11} /> {e.email}
                        </span>
                      )}
                      {e.extraData && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={11} /> {e.extraData}
                        </span>
                      )}
                    </div>
                    {e.notes && (
                      <span className="text-[12px]" style={{ color: T.textSecondary }}>
                        {e.notes}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {amount != null && (
                    <>
                      <span className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
                        {formatCurrency(amount)}
                      </span>
                      <span className="text-[10px]" style={{ color: T.textMuted }}>
                        {e.salaryType === "MONTHLY" ? "/міс" : "/год"}
                      </span>
                    </>
                  )}
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => openEdit(e)}
                      className="rounded-lg px-2 py-1"
                      style={{ color: T.textMuted }}
                      title="Редагувати"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="rounded-lg px-2 py-1"
                      style={{ color: T.danger }}
                      title="Видалити"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
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
