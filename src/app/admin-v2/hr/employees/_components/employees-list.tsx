"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExcelImportModal } from "../../_components/excel-import-modal";

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
  salaryType: SalaryType | null;
  salaryAmount: number | string | null;
  currency: string;
  extraData: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  fullName: string;
  position: string;
  phone: string;
  email: string;
  residence: string;
  hiredAt: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  position: "",
  phone: "",
  email: "",
  residence: "",
  hiredAt: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
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

function initialsOf(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function EmployeesList({ currentUserRole }: { currentUserRole: string }) {
  const canEdit = ["SUPER_ADMIN", "MANAGER", "HR"].includes(currentUserRole);

  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [creating, setCreating] = useState<FormState | null>(null);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [creatingSaving, setCreatingSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/hr/employees", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadError(`Не вдалось завантажити: ${j.error ?? `HTTP ${res.status}`}`);
        setItems([]);
        return;
      }
      const j = await res.json();
      setItems(j.data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((e) => {
      if (!showInactive && !e.isActive) return false;
      if (!needle) return true;
      return (
        e.fullName.toLowerCase().includes(needle) ||
        (e.position?.toLowerCase().includes(needle) ?? false) ||
        (e.phone?.toLowerCase().includes(needle) ?? false) ||
        (e.email?.toLowerCase().includes(needle) ?? false) ||
        (e.residence?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [items, search, showInactive]);

  const activeCount = items.filter((e) => e.isActive).length;

  async function submitCreate() {
    if (!creating) return;
    if (!creating.fullName.trim()) {
      setCreatingError("ПІБ обовʼязкове");
      return;
    }
    setCreatingSaving(true);
    setCreatingError(null);
    try {
      const payload = {
        fullName: creating.fullName.trim(),
        position: creating.position.trim() || null,
        phone: creating.phone.trim() || null,
        email: creating.email.trim() || null,
        residence: creating.residence.trim() || null,
        hiredAt: creating.hiredAt || null,
      };
      const res = await fetch(`/api/admin/hr/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setCreatingError(j.error ?? "Помилка");
        return;
      }
      const saved: Employee = j.data;
      setItems((prev) => [saved, ...prev]);
      setCreating(null);
    } finally {
      setCreatingSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={20} style={{ color: T.textPrimary }} />
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Співробітники
        </h1>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {filtered.length}
          {filtered.length !== items.length ? ` / ${items.length}` : ""} ·{" "}
          {activeCount} активних
        </span>
        <div className="flex-1" />
        {canEdit && (
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
              onClick={() => {
                setCreating((c) => (c ? null : { ...EMPTY_FORM }));
                setCreatingError(null);
              }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              <Plus size={13} /> Додати співробітника
            </button>
          </>
        )}
      </div>

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
        ]}
        onImported={() => {
          void load();
        }}
      />

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
            placeholder="Пошук — ПІБ / посада / телефон / email / адреса…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
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
          Показати неактивних
        </label>
      </div>

      {loadError && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}40`,
          }}
        >
          ⚠ {loadError}
          <button
            onClick={() => void load()}
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: T.danger, color: "#fff" }}
          >
            Спробувати ще
          </button>
        </div>
      )}

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
                <th className="px-4 py-3 text-left">ПІБ</th>
                <th className="px-3 py-3 text-left">Посада</th>
                <th className="px-3 py-3 text-left">Телефон</th>
                <th className="px-3 py-3 text-left">Email</th>
                <th className="px-3 py-3 text-left">Проживання</th>
                <th className="px-3 py-3 text-left">Прийнятий</th>
                <th className="px-3 py-3 text-left">Стаж</th>
                <th className="px-3 py-3 text-center">Статус</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {creating && (
                <CreateRow
                  form={creating}
                  setForm={setCreating}
                  saving={creatingSaving}
                  error={creatingError}
                  onCancel={() => {
                    setCreating(null);
                    setCreatingError(null);
                  }}
                  onSubmit={submitCreate}
                />
              )}
              {filtered.map((e, idx) => {
                const tenure = formatTenure(e.hiredAt, e.terminatedAt);
                return (
                  <tr
                    key={e.id}
                    className={`border-t cursor-pointer transition hover:bg-black/5 ${
                      idx < 20 ? "data-table-row-enter" : ""
                    }`}
                    style={{
                      borderColor: T.borderSoft,
                      opacity: e.isActive ? 1 : 0.55,
                      ...(idx < 20 ? { animationDelay: `${idx * 30}ms` } : {}),
                    }}
                    onClick={(ev) => {
                      if ((ev.target as HTMLElement).closest("a, button")) return;
                      window.location.href = `/admin-v2/hr/employees/${e.id}`;
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                        >
                          {initialsOf(e.fullName) || <Users size={14} />}
                        </div>
                        <span className="font-medium truncate" style={{ color: T.textPrimary }}>
                          {e.fullName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {e.position ? (
                        <span className="inline-flex items-center gap-1">
                          <Briefcase size={11} style={{ color: T.textMuted }} /> {e.position}
                        </span>
                      ) : (
                        <span style={{ color: T.textMuted }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {e.phone ?? <span style={{ color: T.textMuted }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {e.email ?? <span style={{ color: T.textMuted }}>—</span>}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[12px] truncate max-w-[200px]"
                      style={{ color: T.textSecondary }}
                    >
                      {e.residence ?? <span style={{ color: T.textMuted }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                      {formatDate(e.hiredAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                      {tenure ?? <span style={{ color: T.textMuted }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {e.isActive ? (
                        <CheckCircle2 size={14} style={{ color: T.success }} className="inline" />
                      ) : (
                        <XCircle size={14} style={{ color: T.textMuted }} className="inline" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Link
                        href={`/admin-v2/hr/employees/${e.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10"
                        title="Відкрити дос'є"
                        aria-label="Дос'є"
                      >
                        <ExternalLink size={13} style={{ color: T.accentPrimary }} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !creating && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                    {search.trim()
                      ? "Нічого не знайдено за фільтрами."
                      : "Список порожній. Додайте через кнопку «Додати співробітника» або імпорт з Excel."}
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

function CreateRow({
  form,
  setForm,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState | null) => FormState | null) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

  const inputStyle: React.CSSProperties = {
    backgroundColor: T.panelSoft,
    border: `1px solid ${T.borderStrong}`,
    color: T.textPrimary,
  };

  return (
    <>
      <tr style={{ borderTop: `2px solid ${T.accentPrimary}`, backgroundColor: T.accentPrimarySoft }}>
        <td className="px-4 py-2">
          <input
            autoFocus
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="ПІБ *"
            className="w-full rounded-lg px-2 py-1 text-sm outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={form.position}
            onChange={(e) => set("position", e.target.value)}
            placeholder="Посада"
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="Телефон"
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={form.residence}
            onChange={(e) => set("residence", e.target.value)}
            placeholder="Місто / адреса"
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={form.hiredAt}
            onChange={(e) => set("hiredAt", e.target.value)}
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2 text-[11px]" style={{ color: T.textMuted }}>
          —
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            Новий
          </span>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
            title="Скасувати"
            aria-label="Скасувати"
          >
            <X size={14} style={{ color: T.textSecondary }} />
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
            title="Зберегти"
            aria-label="Зберегти"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" style={{ color: T.accentPrimary }} />
            ) : (
              <CheckCircle2 size={14} style={{ color: T.success }} />
            )}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td
            colSpan={9}
            className="px-4 py-2 text-[12px]"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
