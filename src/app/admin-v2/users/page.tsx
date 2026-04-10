"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Shield,
  Users as UsersIcon,
  User as UserIcon,
  Wrench,
  Calculator,
  Loader2,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count?: {
    createdEstimates: number;
    engineerReviews: number;
    financeReviews: number;
    clientProjects: number;
  };
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  USER: "Користувач",
  CLIENT: "Клієнт",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  SUPER_ADMIN: Shield,
  MANAGER: UsersIcon,
  ENGINEER: Wrench,
  FINANCIER: Calculator,
  USER: UserIcon,
  CLIENT: UserIcon,
};

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  MANAGER: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  ENGINEER: { bg: T.successSoft, fg: T.success },
  FINANCIER: { bg: T.warningSoft, fg: T.warning },
  USER: { bg: T.panelElevated, fg: T.textMuted },
  CLIENT: { bg: T.panelElevated, fg: T.textMuted },
};

export default function AdminV2UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "MANAGER",
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data || []))
      .catch(() => setError("Не вдалось завантажити користувачів"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Помилка створення");
      }
      const { data } = await res.json();
      setUsers((prev) => [
        {
          ...data,
          isActive: true,
          createdAt: new Date().toISOString(),
          phone: form.phone || null,
        },
        ...prev,
      ]);
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", password: "", role: "MANAGER" });
    } catch (err: any) {
      setError(err?.message || "Помилка створення");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.role } : u)));
        setEditingRole(null);
      } else {
        const errBody = await res.json().catch(() => ({}));
        alert(errBody.error || "Помилка зміни ролі");
      }
    } catch {
      alert("Помилка зміни ролі");
    }
  }

  async function toggleStatus(userId: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isActive: newStatus } : u))
        );
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            СИСТЕМА
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Користувачі
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {users.length} {users.length === 1 ? "користувач" : "користувачів"} у системі
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати користувача
        </button>
      </section>

      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Новий користувач
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Імʼя" required value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
            <FormInput
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            />
            <FormInput label="Телефон" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <FormInput
              label="Пароль"
              type="password"
              value={form.password}
              onChange={(v) => setForm((p) => ({ ...p, password: v }))}
            />
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                РОЛЬ
              </span>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="rounded-xl px-3.5 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
              >
                {error}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
                Створити
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={16} style={{ color: T.textMuted }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за імʼям або email…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: T.textPrimary }}
        />
      </div>

      {/* List */}
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
            className="rounded-2xl py-12 text-center text-sm"
            style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            {search ? "Нічого не знайдено" : "Користувачів немає"}
          </div>
        ) : (
          filtered.map((u) => {
            const Icon = ROLE_ICONS[u.role] || UserIcon;
            const isEditingThisRole = editingRole === u.id;
            const colors = ROLE_COLORS[u.role] || ROLE_COLORS.USER;
            return (
              <div
                key={u.id}
                className="flex items-start justify-between gap-4 rounded-2xl p-5"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <Icon size={20} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                      {u.name}
                    </span>
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      {u.email}
                      {u.phone && ` · ${u.phone}`}
                    </span>
                    {u._count && (
                      <div className="flex flex-wrap gap-3 mt-1 text-[10px]" style={{ color: T.textMuted }}>
                        {u._count.createdEstimates > 0 && <span>📝 {u._count.createdEstimates} створено</span>}
                        {u._count.engineerReviews > 0 && <span>✅ {u._count.engineerReviews} інженер</span>}
                        {u._count.financeReviews > 0 && <span>💰 {u._count.financeReviews} фінансист</span>}
                        {u._count.clientProjects > 0 && <span>🏗️ {u._count.clientProjects} проєктів</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditingThisRole ? (
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      onBlur={() => setEditingRole(null)}
                      autoFocus
                      className="rounded-lg px-2 py-1 text-xs font-semibold outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderAccent}`,
                        color: T.textPrimary,
                      }}
                    >
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingRole(u.id)}
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: colors.bg, color: colors.fg }}
                    >
                      {ROLE_LABELS[u.role]}
                    </button>
                  )}
                  <button
                    onClick={() => toggleStatus(u.id, u.isActive)}
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: u.isActive ? T.successSoft : T.panelElevated,
                      color: u.isActive ? T.success : T.textMuted,
                    }}
                  >
                    {u.isActive ? "Активний" : "Неактивний"}
                  </button>
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
