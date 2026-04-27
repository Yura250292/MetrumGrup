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
  MapPin,
  Calendar,
  Heart,
  CalendarPlus,
  CalendarMinus,
  Wallet,
  Save,
  StickyNote,
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
  birthDate: string | null;
  residence: string | null;
  maritalStatus: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
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
  birthDate: string;
  residence: string;
  maritalStatus: string;
  hiredAt: string;
  terminatedAt: string;
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
  birthDate: "",
  residence: "",
  maritalStatus: "",
  hiredAt: "",
  terminatedAt: "",
  salaryType: "MONTHLY",
  salaryAmount: "",
  currency: "UAH",
  extraData: "",
  notes: "",
  isActive: true,
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("uk-UA");
}

function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatTenure(hired: string | null, terminated: string | null): string | null {
  if (!hired) return null;
  const start = new Date(hired);
  const end = terminated ? new Date(terminated) : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (months < 1) return "< 1 міс";
  if (months < 12) return `${months} міс`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} р ${rem} міс` : `${years} р`;
}

export default function HrEmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
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
      (e.email?.toLowerCase().includes(q) ?? false) ||
      (e.residence?.toLowerCase().includes(q) ?? false)
    );
  });

  const activeCount = items.filter((e) => e.isActive).length;
  const editingItem = editingId ? items.find((e) => e.id === editingId) ?? null : null;

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setViewMode("view");
    setForm(emptyForm);
    setError(null);
  }

  function openCreate() {
    setEditingId(null);
    setViewMode("edit");
    setForm(emptyForm);
    setShowModal(true);
    setError(null);
  }

  function openProfile(e: Employee) {
    setEditingId(e.id);
    setViewMode("view");
    setForm({
      fullName: e.fullName,
      phone: e.phone ?? "",
      email: e.email ?? "",
      position: e.position ?? "",
      birthDate: toDateInput(e.birthDate),
      residence: e.residence ?? "",
      maritalStatus: e.maritalStatus ?? "",
      hiredAt: toDateInput(e.hiredAt),
      terminatedAt: toDateInput(e.terminatedAt),
      salaryType: e.salaryType,
      salaryAmount: e.salaryAmount != null ? String(e.salaryAmount) : "",
      currency: e.currency,
      extraData: e.extraData ?? "",
      notes: e.notes ?? "",
      isActive: e.isActive,
    });
    setShowModal(true);
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
      birthDate: form.birthDate || null,
      residence: form.residence.trim() || null,
      maritalStatus: form.maritalStatus.trim() || null,
      hiredAt: form.hiredAt || null,
      terminatedAt: form.terminatedAt || null,
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
        editingId ? prev.map((e) => (e.id === editingId ? data : e)) : [...prev, data],
      );
      if (editingId) {
        setViewMode("view");
      } else {
        closeModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити співробітника?")) return;
    const res = await fetch(`/api/admin/hr/employees?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) closeModal();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            HR
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
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
            onClick={openCreate}
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
          { key: "birthDate", label: "Народження" },
          { key: "residence", label: "Проживання" },
          { key: "hiredAt", label: "Прийнятий" },
          { key: "salaryAmount", label: "ЗП" },
        ]}
        onImported={() => {
          void reload();
        }}
      />

      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={16} style={{ color: T.textMuted }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за ПІБ, посадою, телефоном, адресою…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: T.textPrimary }}
        />
      </div>

      {fetching ? (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
          style={{
            backgroundColor: T.panel,
            color: T.textMuted,
            border: `1px solid ${T.borderSoft}`,
          }}
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e, idx) => (
            <div
              key={e.id}
              className={idx < 24 ? "data-table-row-enter" : undefined}
              style={idx < 24 ? { animationDelay: `${idx * 28}ms` } : undefined}
            >
              <EmployeeCard employee={e} onClick={() => openProfile(e)} />
            </div>
          ))}
        </div>
      )}

      {error && !showModal && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          {error}
        </div>
      )}

      {showModal && (
        <ProfileModal
          isNew={!editingId}
          mode={viewMode}
          onModeChange={setViewMode}
          form={form}
          setForm={setForm}
          loading={loading}
          error={error}
          original={editingItem}
          onSubmit={handleSubmit}
          onClose={closeModal}
          onDelete={editingId ? () => handleDelete(editingId) : undefined}
        />
      )}
    </div>
  );
}

function EmployeeCard({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const e = employee;
  const initials = e.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const age = calcAge(e.birthDate);
  const tenure = formatTenure(e.hiredAt, e.terminatedAt);

  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 rounded-2xl p-4 text-left transition hover:brightness-[0.98]"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-[14px] font-bold"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          {initials || <Users size={20} />}
        </div>
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          <span
            className="text-[14px] font-semibold truncate"
            style={{ color: T.textPrimary }}
          >
            {e.fullName}
          </span>
          {e.position && (
            <span className="text-[12px] truncate" style={{ color: T.textSecondary }}>
              {e.position}
            </span>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
          style={{
            backgroundColor: e.isActive ? T.successSoft : T.panelElevated,
            color: e.isActive ? T.success : T.textMuted,
          }}
        >
          {e.isActive ? "Активний" : "Неактивний"}
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
        style={{ color: T.textMuted }}
      >
        {e.phone && (
          <span className="flex items-center gap-1">
            <Phone size={11} /> {e.phone}
          </span>
        )}
        {age !== null && (
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {age} р
          </span>
        )}
        {tenure && (
          <span className="flex items-center gap-1">
            <Briefcase size={11} /> {tenure}
          </span>
        )}
        {e.residence && (
          <span className="flex items-center gap-1 truncate max-w-full">
            <MapPin size={11} /> {e.residence}
          </span>
        )}
      </div>

      {e.notes && (
        <p
          className="text-[12px] line-clamp-2"
          style={{ color: T.textSecondary }}
        >
          {e.notes}
        </p>
      )}
    </button>
  );
}

function ProfileModal({
  isNew,
  mode,
  onModeChange,
  form,
  setForm,
  loading,
  error,
  original,
  onSubmit,
  onClose,
  onDelete,
}: {
  isNew: boolean;
  mode: "view" | "edit";
  onModeChange: (m: "view" | "edit") => void;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  loading: boolean;
  error: string | null;
  original: Employee | null;
  onSubmit: (ev: React.FormEvent) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const editing = isNew || mode === "edit";
  const initials = form.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const age = calcAge(original?.birthDate ?? form.birthDate ?? null);
  const tenure = formatTenure(
    original?.hiredAt ?? form.hiredAt ?? null,
    original?.terminatedAt ?? form.terminatedAt ?? null,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-3 p-5"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {initials || <Users size={22} />}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: T.textPrimary }}>
                {isNew ? "Новий співробітник" : form.fullName || "—"}
              </h2>
              <div
                className="flex flex-wrap items-center gap-2 text-[12px]"
                style={{ color: T.textMuted }}
              >
                {form.position && <span>{form.position}</span>}
                {age !== null && <span>· {age} р</span>}
                {tenure && <span>· стаж {tenure}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2" style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 p-5 flex flex-col gap-6">
            <Section title="Основне">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="ПІБ"
                  required
                  editing={editing}
                  value={form.fullName}
                  onChange={(v) => setForm((p) => ({ ...p, fullName: v }))}
                />
                <Field
                  label="Посада"
                  editing={editing}
                  value={form.position}
                  onChange={(v) => setForm((p) => ({ ...p, position: v }))}
                  icon={<Briefcase size={12} />}
                />
                <Field
                  label="Дата народження"
                  type="date"
                  editing={editing}
                  value={form.birthDate}
                  onChange={(v) => setForm((p) => ({ ...p, birthDate: v }))}
                  display={formatDate(form.birthDate || null)}
                  icon={<Calendar size={12} />}
                  hint={age !== null && form.birthDate ? `${age} років` : undefined}
                />
                <Field
                  label="Сімейний стан"
                  editing={editing}
                  value={form.maritalStatus}
                  onChange={(v) => setForm((p) => ({ ...p, maritalStatus: v }))}
                  icon={<Heart size={12} />}
                />
              </div>
            </Section>

            <Section title="Контакти">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Телефон"
                  editing={editing}
                  value={form.phone}
                  onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                  icon={<Phone size={12} />}
                />
                <Field
                  label="Email"
                  type="email"
                  editing={editing}
                  value={form.email}
                  onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                  icon={<Mail size={12} />}
                />
                <Field
                  label="Місце проживання"
                  editing={editing}
                  value={form.residence}
                  onChange={(v) => setForm((p) => ({ ...p, residence: v }))}
                  icon={<MapPin size={12} />}
                  span={2}
                />
              </div>
            </Section>

            <Section title="Робота">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Початок роботи"
                  type="date"
                  editing={editing}
                  value={form.hiredAt}
                  onChange={(v) => setForm((p) => ({ ...p, hiredAt: v }))}
                  display={formatDate(form.hiredAt || null)}
                  icon={<CalendarPlus size={12} />}
                />
                <Field
                  label="Звільнення"
                  type="date"
                  editing={editing}
                  value={form.terminatedAt}
                  onChange={(v) => setForm((p) => ({ ...p, terminatedAt: v }))}
                  display={formatDate(form.terminatedAt || null)}
                  icon={<CalendarMinus size={12} />}
                />
                {editing && (
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
                )}
              </div>
            </Section>

            <Section title="Зарплата">
              <div className="grid gap-3 sm:grid-cols-2">
                {editing ? (
                  <label className="flex flex-col gap-1.5">
                    <span
                      className="text-[10px] font-bold tracking-wider"
                      style={{ color: T.textMuted }}
                    >
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
                            border: `1px solid ${
                              form.salaryType === t ? T.borderAccent : T.borderStrong
                            }`,
                          }}
                        >
                          {t === "MONTHLY" ? "Місячна" : "Погодинна"}
                        </button>
                      ))}
                    </div>
                  </label>
                ) : (
                  <ReadField
                    label="Тип ЗП"
                    value={form.salaryType === "MONTHLY" ? "Місячна" : "Погодинна"}
                    icon={<Wallet size={12} />}
                  />
                )}
                <Field
                  label={form.salaryType === "MONTHLY" ? "Сума на місяць, ₴" : "Ставка за годину, ₴"}
                  type="number"
                  editing={editing}
                  value={form.salaryAmount}
                  onChange={(v) => setForm((p) => ({ ...p, salaryAmount: v }))}
                  display={
                    form.salaryAmount
                      ? `${formatCurrency(parseFloat(form.salaryAmount))} ${
                          form.salaryType === "MONTHLY" ? "/міс" : "/год"
                        }`
                      : undefined
                  }
                />
              </div>
            </Section>

            <Section
              title="Коментар"
              icon={<StickyNote size={14} style={{ color: T.accentPrimary }} />}
            >
              {editing ? (
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={4}
                  placeholder="Додайте будь-які примітки про співробітника…"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-y"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              ) : (
                <p
                  className="rounded-xl px-3.5 py-3 text-sm whitespace-pre-wrap"
                  style={{
                    backgroundColor: T.panelSoft,
                    color: form.notes ? T.textPrimary : T.textMuted,
                    border: `1px solid ${T.borderSoft}`,
                    minHeight: 60,
                  }}
                >
                  {form.notes || "Без коментаря"}
                </p>
              )}
              {form.extraData && !editing && (
                <p className="mt-2 text-[12px]" style={{ color: T.textMuted }}>
                  Додаткові дані: <span style={{ color: T.textSecondary }}>{form.extraData}</span>
                </p>
              )}
              {editing && (
                <label className="mt-3 flex flex-col gap-1.5">
                  <span
                    className="text-[10px] font-bold tracking-wider"
                    style={{ color: T.textMuted }}
                  >
                    ДОДАТКОВІ ДАНІ
                  </span>
                  <input
                    type="text"
                    value={form.extraData}
                    onChange={(e) => setForm((p) => ({ ...p, extraData: e.target.value }))}
                    className="rounded-xl px-3.5 py-3 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                </label>
              )}
            </Section>

            {error && (
              <div
                className="rounded-xl px-3 py-2.5 text-xs"
                style={{
                  backgroundColor: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.danger}`,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 p-5"
            style={{ borderTop: `1px solid ${T.borderSoft}` }}
          >
            <div>
              {!isNew && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
                  style={{
                    color: T.danger,
                    backgroundColor: T.dangerSoft,
                    border: `1px solid ${T.danger}`,
                  }}
                >
                  <Trash2 size={14} /> Видалити
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  {!isNew && (
                    <button
                      type="button"
                      onClick={() => onModeChange("view")}
                      className="rounded-xl px-4 py-2.5 text-sm font-medium"
                      style={{ color: T.textSecondary }}
                    >
                      Скасувати
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: T.accentPrimary }}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {isNew ? "Створити" : "Зберегти"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onModeChange("edit")}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  <Pencil size={14} /> Редагувати
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3
          className="text-[10px] font-bold tracking-widest"
          style={{ color: T.textMuted }}
        >
          {title.toUpperCase()}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  type = "text",
  editing,
  value,
  onChange,
  required,
  display,
  icon,
  hint,
  span,
}: {
  label: string;
  type?: string;
  editing: boolean;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  display?: string | null;
  icon?: React.ReactNode;
  hint?: string;
  span?: 1 | 2;
}) {
  if (!editing) {
    return (
      <ReadField
        label={label}
        value={display ?? value}
        icon={icon}
        hint={hint}
        span={span}
      />
    );
  }
  return (
    <label
      className={`flex flex-col gap-1.5${span === 2 ? " sm:col-span-2" : ""}`}
    >
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

function ReadField({
  label,
  value,
  icon,
  hint,
  span,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  hint?: string;
  span?: 1 | 2;
}) {
  return (
    <div className={`flex flex-col gap-1.5${span === 2 ? " sm:col-span-2" : ""}`}>
      <span
        className="text-[10px] font-bold tracking-wider flex items-center gap-1"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label.toUpperCase()}
      </span>
      <span
        className="text-sm rounded-xl px-3.5 py-3"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderSoft}`,
          color: value ? T.textPrimary : T.textMuted,
        }}
      >
        {value || "—"}
      </span>
      {hint && (
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {hint}
        </span>
      )}
    </div>
  );
}
