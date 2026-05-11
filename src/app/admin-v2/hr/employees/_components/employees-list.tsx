"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
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
import { ROLE_COLORS, ROLE_LABELS } from "../../../_lib/role-display";
import { EmployeeCard } from "./employee-card";

type LinkedUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
};

type EmploymentType = "FULL" | "PART" | "CONTRACT";
type DeferralType = "NONE" | "RESERVATION" | "DEFERMENT";

type SalaryPeriod = {
  baseSalary: number | string;
  officialPart: number | string | null;
  coefficient: number | string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

type Employee = {
  id: string;
  fullName: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  notes: string | null;
  isActive: boolean;
  employmentType: EmploymentType;
  employmentRate: number | string;
  deferralType: DeferralType;
  deferralUntil: string | null;
  userId: string | null;
  user: LinkedUser | null;
  salaries?: SalaryPeriod[];
  createdAt: string;
};

type ExternalUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

type AccountFilter = "all" | "linked" | "unlinked";
type Tab = "employees" | "external";

type CreateForm = {
  lastName: string;
  firstName: string;
  middleName: string;
  position: string;
  phone: string;
  email: string;
  birthDate: string;
  hiredAt: string;
};

const EMPTY_CREATE_FORM: CreateForm = {
  lastName: "",
  firstName: "",
  middleName: "",
  position: "",
  phone: "",
  email: "",
  birthDate: "",
  hiredAt: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
}

export function EmployeesList({
  currentUserRole,
  initialTab,
}: {
  currentUserRole: string;
  initialTab?: Tab;
}) {
  const canEdit = ["SUPER_ADMIN", "MANAGER", "HR"].includes(currentUserRole);
  const canSeeExternal = currentUserRole === "SUPER_ADMIN";
  // ЗП — лише SUPER_ADMIN (правило: цифри бачить тільки Адмін).
  const canSeeSalary = currentUserRole === "SUPER_ADMIN";

  const [tab, setTab] = useState<Tab>(
    initialTab === "external" && canSeeExternal ? "external" : "employees",
  );
  const [items, setItems] = useState<Employee[]>([]);
  const [externalUsers, setExternalUsers] = useState<ExternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [showImport, setShowImport] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      if (tab === "employees") {
        const res = await fetch("/api/admin/hr/employees", { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setLoadError(`Не вдалось завантажити: ${j.error ?? `HTTP ${res.status}`}`);
          setItems([]);
          return;
        }
        const j = await res.json();
        setItems(j.data ?? []);
      } else {
        const res = await fetch("/api/admin/users?onlyWithoutEmployee=1", {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setLoadError(`Не вдалось завантажити: ${j.error ?? `HTTP ${res.status}`}`);
          setExternalUsers([]);
          return;
        }
        const j = await res.json();
        setExternalUsers(j.data ?? []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((e) => {
      if (!showInactive && !e.isActive) return false;
      if (accountFilter === "linked" && !e.userId) return false;
      if (accountFilter === "unlinked" && e.userId) return false;
      if (!needle) return true;
      return (
        e.fullName.toLowerCase().includes(needle) ||
        (e.position?.toLowerCase().includes(needle) ?? false) ||
        (e.phone?.toLowerCase().includes(needle) ?? false) ||
        (e.email?.toLowerCase().includes(needle) ?? false) ||
        (e.department?.name.toLowerCase().includes(needle) ?? false) ||
        (e.user?.email?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [items, search, showInactive, accountFilter]);

  const filteredExternal = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return externalUsers.filter((u) => {
      if (!showInactive && !u.isActive) return false;
      if (!needle) return true;
      return (
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.phone?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [externalUsers, search, showInactive]);

  const activeCount = items.filter((e) => e.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={20} style={{ color: T.textPrimary }} />
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Співробітники та акаунти
        </h1>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {tab === "employees"
            ? `${filtered.length}${
                filtered.length !== items.length ? ` / ${items.length}` : ""
              } · ${activeCount} активних`
            : `${filteredExternal.length} зовнішніх акаунтів`}
        </span>
        <div className="flex-1" />
        {tab === "employees" && canEdit && (
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
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              <Plus size={13} /> Додати співробітника
            </button>
          </>
        )}
      </div>

      {canSeeExternal && (
        <div
          className="inline-flex w-fit gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
        >
          {(
            [
              { id: "employees" as const, label: "Співробітники" },
              { id: "external" as const, label: "Зовнішні акаунти" },
            ]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                style={{
                  backgroundColor: active ? T.panel : "transparent",
                  color: active ? T.textPrimary : T.textMuted,
                  border: active ? `1px solid ${T.borderStrong}` : "1px solid transparent",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

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

      {showCreateModal && (
        <CreateEmployeeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(emp) => {
            setItems((prev) => [emp, ...prev]);
            setShowCreateModal(false);
          }}
        />
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
            placeholder={
              tab === "employees"
                ? "Пошук — ПІБ / посада / телефон / email / підрозділ…"
                : "Пошук — імʼя / email / телефон…"
            }
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        {tab === "employees" && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value as AccountFilter)}
            className="rounded-xl px-2.5 py-1.5 text-[12px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          >
            <option value="all">Усі</option>
            <option value="linked">З акаунтом</option>
            <option value="unlinked">Без акаунта</option>
          </select>
        )}
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

      {!loading && tab === "employees" && (
        filtered.length === 0 ? (
          <div
            className="rounded-2xl px-4 py-12 text-center text-sm"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
              color: T.textMuted,
            }}
          >
            {search.trim() || accountFilter !== "all"
              ? "Нічого не знайдено за фільтрами."
              : "Список порожній. Додайте через кнопку «Додати співробітника» або імпорт з Excel."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((e, idx) => (
              <div
                key={e.id}
                className={idx < 20 ? "data-table-row-enter" : ""}
                style={idx < 20 ? { animationDelay: `${idx * 30}ms` } : undefined}
              >
                <EmployeeCard employee={e} canSeeSalary={canSeeSalary} />
              </div>
            ))}
          </div>
        )
      )}

      {!loading && tab === "external" && (
        <ExternalAccountsTable
          users={filteredExternal}
          searchActive={Boolean(search.trim())}
        />
      )}
    </div>
  );
}

function ExternalAccountsTable({
  users,
  searchActive,
}: {
  users: ExternalUser[];
  searchActive: boolean;
}) {
  return (
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
            <th className="px-4 py-3 text-left">Імʼя</th>
            <th className="px-3 py-3 text-left">Email</th>
            <th className="px-3 py-3 text-left">Телефон</th>
            <th className="px-3 py-3 text-left">Роль</th>
            <th className="px-3 py-3 text-center">Статус</th>
            <th className="px-3 py-3 text-left">Створено</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t" style={{ borderColor: T.borderSoft, opacity: u.isActive ? 1 : 0.55 }}>
              <td className="px-4 py-2.5 font-medium" style={{ color: T.textPrimary }}>
                {u.name}
              </td>
              <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                <a href={`mailto:${u.email}`} className="hover:underline">
                  {u.email}
                </a>
              </td>
              <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                {u.phone ? (
                  <a href={`tel:${u.phone}`} className="hover:underline">
                    {u.phone}
                  </a>
                ) : (
                  <span style={{ color: T.textMuted }}>—</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: ROLE_COLORS[u.role]?.bg ?? T.panelSoft,
                    color: ROLE_COLORS[u.role]?.fg ?? T.textMuted,
                  }}
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center">
                {u.isActive ? (
                  <CheckCircle2 size={14} style={{ color: T.success }} className="inline" />
                ) : (
                  <XCircle size={14} style={{ color: T.textMuted }} className="inline" />
                )}
              </td>
              <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: T.textSecondary }}>
                {formatDate(u.createdAt)}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                {searchActive
                  ? "Нічого не знайдено."
                  : "Немає зовнішніх акаунтів. Усі User-и у системі привʼязані до співробітників."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CreateEmployeeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (e: Employee) => void;
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    const lastName = form.lastName.trim();
    const firstName = form.firstName.trim();
    const middleName = form.middleName.trim();
    if (!lastName && !firstName) {
      setError("Вкажіть хоча б Прізвище або Імʼя");
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Невірний формат email");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        lastName: lastName || null,
        firstName: firstName || null,
        middleName: middleName || null,
        position: form.position.trim() || null,
        phone: form.phone.trim() || null,
        email: email || null,
        birthDate: form.birthDate || null,
        hiredAt: form.hiredAt || null,
      };
      const res = await fetch("/api/admin/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          j?.details?.fieldErrors &&
          Object.values(j.details.fieldErrors)
            .flat()
            .filter(Boolean)
            .join("; ");
        setError(detail || j?.error || "Помилка збереження");
        return;
      }
      onCreated(j.data as Employee);
    } catch {
      setError("Помилка мережі");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.55)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
          boxShadow: "0 24px 48px rgba(15,23,42,0.25)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Новий співробітник
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5"
            aria-label="Закрити"
          >
            <X size={16} style={{ color: T.textMuted }} />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <FormField label="Прізвище" required>
            <input
              autoFocus
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Імʼя">
            <input
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="По-батькові" full>
            <input
              value={form.middleName}
              onChange={(e) => set("middleName", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Посада" full>
            <input
              value={form.position}
              onChange={(e) => set("position", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Телефон">
            <input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Дата народження">
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>
          <FormField label="Прийнятий">
            <input
              type="date"
              value={form.hiredAt}
              onChange={(e) => set("hiredAt", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={modalInputStyle()}
            />
          </FormField>

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
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Створити співробітника
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
        {required && <span style={{ color: T.danger }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function modalInputStyle(): React.CSSProperties {
  return {
    backgroundColor: T.panelSoft,
    border: `1px solid ${T.borderStrong}`,
    color: T.textPrimary,
  };
}
