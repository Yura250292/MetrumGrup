"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Mail, Phone, Users, Loader2, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Client = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function AdminV2ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users?role=CLIENT")
      .then((r) => r.json())
      .then((d) => setClients(d.data || []))
      .catch(() => setError("Не вдалось завантажити клієнтів"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = clients.filter((c) => c.isActive).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "CLIENT" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Помилка створення клієнта");
      }
      const { data } = await res.json();
      setClients((prev) => [
        {
          ...data,
          isActive: true,
          createdAt: new Date().toISOString(),
          phone: form.phone || null,
        },
        ...prev,
      ]);
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", password: "" });
    } catch (err: any) {
      setError(err?.message || "Помилка створення клієнта");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            БАЗА КЛІЄНТІВ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Клієнти
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {clients.length} {clients.length === 1 ? "клієнт" : "клієнтів"} · {activeCount} активних
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> {showForm ? "Сховати форму" : "Додати клієнта"}
        </button>
      </section>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Новий клієнт
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="Імʼя"
              required
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            />
            <FormInput
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            />
            <FormInput
              label="Телефон"
              value={form.phone}
              onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
            />
            <FormInput
              label="Пароль (за замовч. password123)"
              type="password"
              value={form.password}
              onChange={(v) => setForm((p) => ({ ...p, password: v }))}
            />
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
                {loading ? "Створюю..." : "Створити"}
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
            <Loader2 size={16} className="animate-spin" /> Завантажуємо клієнтів…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} hasClients={clients.length > 0} />
        ) : (
          filtered.map((client) => (
            <div
              key={client.id}
              className="flex items-start gap-4 rounded-2xl p-5"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-base font-bold"
                style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              >
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-1 flex-col gap-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-semibold truncate" style={{ color: T.textPrimary }}>
                    {client.name}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide flex-shrink-0"
                    style={{
                      backgroundColor: client.isActive ? T.successSoft : T.panelElevated,
                      color: client.isActive ? T.success : T.textMuted,
                    }}
                  >
                    {client.isActive ? "Активний" : "Неактивний"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[13px]" style={{ color: T.textSecondary }}>
                  <span className="flex items-center gap-2">
                    <Mail size={14} style={{ color: T.accentPrimary }} />
                    <span className="truncate">{client.email}</span>
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-2 min-w-0">
                      <Phone size={14} style={{ color: T.success }} className="flex-shrink-0" />
                      <span className="truncate">{client.phone}</span>
                    </span>
                  )}
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

function EmptyState({ search, hasClients }: { search: string; hasClients: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-12 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <Users size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        {search ? "Нічого не знайдено" : "Клієнтів ще немає"}
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        {search
          ? `За запитом "${search}" немає результатів`
          : hasClients
            ? "Спробуйте інший запит"
            : "Створіть першого клієнта, щоб почати"}
      </span>
    </div>
  );
}
