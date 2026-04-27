"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  HardHat,
  Search,
  Phone,
  Mail,
  Calendar,
  Loader2,
  X,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExcelImportModal } from "../_components/excel-import-modal";

type RateType = "PER_HOUR" | "PER_DAY" | "PER_MONTH" | "PER_SQM" | "PER_PIECE";

type Subcontractor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialty: string;
  rateType: RateType;
  rateAmount: number | string | null;
  rateUnit: string | null;
  availableFrom: string | null;
  notes: string | null;
  isActive: boolean;
  crewAssignments?: Array<{ project: { title: string } }>;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  specialty: string;
  rateType: RateType;
  rateAmount: string;
  rateUnit: string;
  availableFrom: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  phone: "",
  email: "",
  specialty: "",
  rateType: "PER_DAY",
  rateAmount: "",
  rateUnit: "",
  availableFrom: "",
  notes: "",
  isActive: true,
};

const RATE_LABEL: Record<RateType, string> = {
  PER_HOUR: "За годину",
  PER_DAY: "За день",
  PER_MONTH: "За місяць",
  PER_SQM: "За м²",
  PER_PIECE: "За штуку",
};

const RATE_SUFFIX: Record<RateType, string> = {
  PER_HOUR: "/год",
  PER_DAY: "/день",
  PER_MONTH: "/міс",
  PER_SQM: "/м²",
  PER_PIECE: "/шт",
};

const RATE_DEFAULT_UNIT: Record<RateType, string> = {
  PER_HOUR: "грн/год",
  PER_DAY: "грн/день",
  PER_MONTH: "грн/міс",
  PER_SQM: "грн/м²",
  PER_PIECE: "грн/шт",
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function HrSubcontractorsPage() {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/hr/subcontractors");
    const d = await r.json();
    setItems(d.data || []);
  }

  useEffect(() => {
    reload()
      .catch(() => setError("Не вдалось завантажити"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = items.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      w.specialty.toLowerCase().includes(q) ||
      (w.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const activeCount = items.filter((w) => w.isActive).length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function openEdit(w: Subcontractor) {
    setEditingId(w.id);
    setForm({
      name: w.name,
      phone: w.phone ?? "",
      email: w.email ?? "",
      specialty: w.specialty,
      rateType: w.rateType,
      rateAmount: w.rateAmount != null ? String(w.rateAmount) : "",
      rateUnit: w.rateUnit ?? "",
      availableFrom: toDateInput(w.availableFrom),
      notes: w.notes ?? "",
      isActive: w.isActive,
    });
    setShowForm(true);
    setError(null);
  }

  function setRateType(t: RateType) {
    setForm((p) => {
      const prevDefault = RATE_DEFAULT_UNIT[p.rateType];
      const next: FormState = { ...p, rateType: t };
      if (!p.rateUnit || p.rateUnit === prevDefault) {
        next.rateUnit = RATE_DEFAULT_UNIT[t];
      }
      return next;
    });
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      rateType: form.rateType,
      rateAmount: form.rateAmount ? parseFloat(form.rateAmount) : null,
      rateUnit: form.rateUnit.trim() || null,
      availableFrom: form.availableFrom || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    };
    try {
      const res = await fetch("/api/admin/hr/subcontractors", {
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
        editingId
          ? prev.map((w) => (w.id === editingId ? { ...data, crewAssignments: w.crewAssignments ?? [] } : w))
          : [...prev, { ...data, crewAssignments: [] }]
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити підрядника?")) return;
    const res = await fetch(`/api/admin/hr/subcontractors?id=${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            HR
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Підрядники
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {items.length} майстрів · {activeCount} активних
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
            <Plus size={16} /> Додати підрядника
          </button>
        </div>
      </section>

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Імпорт підрядників"
        templateUrl="/api/admin/hr/subcontractors/template"
        importUrl="/api/admin/hr/subcontractors/import"
        previewColumns={[
          { key: "name", label: "ПІБ" },
          { key: "specialty", label: "Спеціальність" },
          { key: "phone", label: "Телефон" },
          { key: "rateType", label: "Тип тарифу" },
          { key: "rateAmount", label: "Сума" },
          { key: "rateUnit", label: "Одиниця" },
          { key: "availableFrom", label: "З дати" },
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
              {editingId ? "Редагувати підрядника" : "Новий підрядник"}
            </h3>
            <button onClick={resetForm}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="ПІБ"
              required
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            />
            <FormInput
              label="Спеціальність"
              required
              value={form.specialty}
              onChange={(v) => setForm((p) => ({ ...p, specialty: v }))}
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
            <label className="sm:col-span-2 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ТИП ТАРИФУ
              </span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RATE_LABEL) as RateType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRateType(t)}
                    className="rounded-xl px-3 py-2.5 text-sm font-semibold"
                    style={{
                      backgroundColor:
                        form.rateType === t ? T.accentPrimarySoft : T.panelSoft,
                      color: form.rateType === t ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${form.rateType === t ? T.borderAccent : T.borderStrong}`,
                    }}
                  >
                    {RATE_LABEL[t]}
                  </button>
                ))}
              </div>
            </label>
            <FormInput
              label="Сума, ₴"
              type="number"
              value={form.rateAmount}
              onChange={(v) => setForm((p) => ({ ...p, rateAmount: v }))}
            />
            <FormInput
              label="Одиниця (напр. грн/м²)"
              value={form.rateUnit}
              onChange={(v) => setForm((p) => ({ ...p, rateUnit: v }))}
            />
            <FormInput
              label="Доступний з"
              type="date"
              value={form.availableFrom}
              onChange={(v) => setForm((p) => ({ ...p, availableFrom: v }))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                АКТИВНИЙ
              </span>
              <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl" style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                <span className="text-sm" style={{ color: T.textSecondary }}>
                  {form.isActive ? "Активний" : "Неактивний"}
                </span>
              </div>
            </label>
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
          placeholder="Пошук за ПІБ, спеціальністю, телефоном…"
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
            <HardHat size={28} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              {search ? "Нічого не знайдено" : "Підрядників ще немає"}
            </span>
          </div>
        ) : (
          filtered.map((w, idx) => {
            const amount = w.rateAmount != null ? Number(w.rateAmount) : null;
            const currentProject = w.crewAssignments?.[0]?.project;
            return (
              <div
                key={w.id}
                className={`premium-card flex items-start justify-between gap-3 rounded-2xl p-4 ${idx < 20 ? "data-table-row-enter" : ""}`}
                style={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                  ...(idx < 20 ? { animationDelay: `${idx * 28}ms` } : {}),
                }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <HardHat size={18} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                        {w.name}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                      >
                        {w.specialty}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: w.isActive ? T.successSoft : T.panelElevated,
                          color: w.isActive ? T.success : T.textMuted,
                        }}
                      >
                        {w.isActive ? "Активний" : "Неактивний"}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 text-[11px] flex-wrap"
                      style={{ color: T.textMuted }}
                    >
                      {w.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {w.phone}
                        </span>
                      )}
                      {w.email && (
                        <span className="flex items-center gap-1">
                          <Mail size={11} /> {w.email}
                        </span>
                      )}
                      {w.availableFrom && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> з {toDateInput(w.availableFrom)}
                        </span>
                      )}
                      {currentProject && (
                        <span>
                          На обʼєкті:{" "}
                          <span style={{ color: T.textSecondary }}>{currentProject.title}</span>
                        </span>
                      )}
                    </div>
                    {w.notes && (
                      <span className="text-[12px]" style={{ color: T.textSecondary }}>
                        {w.notes}
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
                        {w.rateUnit || RATE_SUFFIX[w.rateType]}
                      </span>
                    </>
                  )}
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => openEdit(w)}
                      className="rounded-lg px-2 py-1"
                      style={{ color: T.textMuted }}
                      title="Редагувати"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
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
