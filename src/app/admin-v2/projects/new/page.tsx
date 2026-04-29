"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderPlus,
  Loader2,
  Save,
  Sparkles,
  AlertCircle,
  UserPlus,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ClientOption = { id: string; name: string; email: string };
type ManagerOption = { id: string; name: string };

export default function AdminV2NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    clientId: "",
    managerId: "",
    totalBudget: "",
    startDate: "",
    expectedEndDate: "",
  });

  // Inline-створення клієнта (щоб не вимагати щоб клієнти заздалегідь були у системі).
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientDraft, setClientDraft] = useState({ name: "", email: "", phone: "" });
  const [creatingClient, setCreatingClient] = useState(false);

  async function createClientInline() {
    if (!clientDraft.name.trim() || !clientDraft.email.trim()) {
      setError("Введіть імʼя та email клієнта");
      return;
    }
    setCreatingClient(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientDraft.name.trim(),
          email: clientDraft.email.trim(),
          phone: clientDraft.phone.trim() || undefined,
          role: "CLIENT",
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Не вдалося створити клієнта");
      }
      const { data } = await res.json();
      const newClient = { id: data.id, name: data.name, email: data.email };
      setClients((prev) => [...prev, newClient]);
      setForm((prev) => ({ ...prev, clientId: newClient.id }));
      setShowClientForm(false);
      setClientDraft({ name: "", email: "", phone: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка створення клієнта");
    } finally {
      setCreatingClient(false);
    }
  }

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        setError(null);
        // firmAware за замовчуванням (через cookie у API). Manager dropdown
        // покаже юзерів з активною роллю MANAGER/SUPER_ADMIN на поточній фірмі.
        const [clientsRes, managersRes] = await Promise.all([
          fetch("/api/admin/users?role=CLIENT"),
          fetch("/api/admin/users?role=MANAGER,SUPER_ADMIN"),
        ]);
        if (!clientsRes.ok || !managersRes.ok) {
          throw new Error("Не вдалося завантажити список користувачів");
        }
        const clientsData = await clientsRes.json();
        const managersData = await managersRes.json();
        setClients(clientsData.data || []);
        setManagers(managersData.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Помилка завантаження");
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, []);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          totalBudget: form.totalBudget ? parseFloat(form.totalBudget) : 0,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка створення проєкту");
      }
      const { data } = await res.json();
      router.push(`/admin-v2/projects/${data.id}`);
    } catch (err: any) {
      setError(err?.message || "Помилка створення");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin-v2/projects"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До списку проєктів
      </Link>

      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СТВОРЕННЯ
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Новий проєкт
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Заповніть основні дані. Команду додасте у Workspace після створення.
        </p>
      </section>

      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-4"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Field label="Назва проєкту" required>
          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            required
            placeholder="Будинок на Липовій, 15"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <Field label="Опис">
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={3}
            placeholder="Детальний опис проєкту…"
            className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <Field label="Адреса">
          <input
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
            placeholder="м. Київ, вул. Липова, 15"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Клієнт" required>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <select
                  value={form.clientId}
                  onChange={(e) => updateField("clientId", e.target.value)}
                  required
                  disabled={loadingUsers || showClientForm}
                  className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm outline-none disabled:opacity-50"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="">
                    {loadingUsers
                      ? "Завантаження…"
                      : clients.length === 0
                        ? "Немає клієнтів — додайте"
                        : "Оберіть клієнта"}
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowClientForm((v) => !v)}
                  className="flex shrink-0 items-center justify-center rounded-xl p-3 transition active:scale-[0.97]"
                  style={{
                    backgroundColor: T.accentPrimary,
                    color: "white",
                  }}
                  title={showClientForm ? "Скасувати додавання" : "Додати нового клієнта"}
                  aria-label={
                    showClientForm ? "Скасувати додавання" : "Додати нового клієнта"
                  }
                >
                  {showClientForm ? <X size={16} /> : <UserPlus size={16} />}
                </button>
              </div>

              {showClientForm && (
                <div
                  className="flex flex-col gap-2 rounded-xl p-3"
                  style={{
                    backgroundColor: T.panelElevated,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <input
                    placeholder="Імʼя клієнта *"
                    value={clientDraft.name}
                    onChange={(e) =>
                      setClientDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={clientDraft.email}
                    onChange={(e) =>
                      setClientDraft((d) => ({ ...d, email: e.target.value }))
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                  <input
                    placeholder="Телефон (опційно)"
                    value={clientDraft.phone}
                    onChange={(e) =>
                      setClientDraft((d) => ({ ...d, phone: e.target.value }))
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                  <button
                    type="button"
                    disabled={creatingClient}
                    onClick={createClientInline}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-60"
                    style={{ backgroundColor: T.emerald ?? "#16A34A", color: "white" }}
                  >
                    {creatingClient ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <UserPlus size={13} />
                    )}
                    {creatingClient ? "Створення…" : "Створити і вибрати"}
                  </button>
                </div>
              )}
            </div>
          </Field>

          <Field label="Менеджер">
            <select
              value={form.managerId}
              onChange={(e) => updateField("managerId", e.target.value)}
              disabled={loadingUsers}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none disabled:opacity-50"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            >
              <option value="">
                {loadingUsers
                  ? "Завантаження…"
                  : managers.length === 0
                    ? "Немає менеджерів"
                    : "Оберіть менеджера"}
              </option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Бюджет, ₴">
          <input
            type="number"
            value={form.totalBudget}
            onChange={(e) => updateField("totalBudget", e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дата початку">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => updateField("startDate", e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
                colorScheme: "dark",
              }}
            />
          </Field>
          <Field label="Планове завершення">
            <input
              type="date"
              value={form.expectedEndDate}
              onChange={(e) => updateField("expectedEndDate", e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
                colorScheme: "dark",
              }}
            />
          </Field>
        </div>

        {/* Hint */}
        <div
          className="flex items-start gap-2.5 rounded-xl p-3.5"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Sparkles size={14} style={{ color: T.accentPrimary }} className="mt-0.5 flex-shrink-0" />
          <span className="text-[11px] leading-relaxed" style={{ color: T.accentPrimary }}>
            Після створення проєкту відкриється Workspace, де ви додасте команду, файли, фото та
            кошториси.
          </span>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/admin-v2/projects"
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </Link>
          <button
            type="submit"
            disabled={loading || loadingUsers}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
            {loading ? "Створення…" : "Створити проєкт"}
          </button>
        </div>
      </form>
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
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
        {required && (
          <span className="ml-1" style={{ color: T.danger }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
