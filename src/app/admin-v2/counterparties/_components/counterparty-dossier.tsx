"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";

type Counterparty = {
  id: string;
  name: string;
  type: "LEGAL" | "INDIVIDUAL" | "FOP";
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

type Stats = {
  count: number;
  totalIncoming: number;
  totalOutgoing: number;
  paidIncoming: number;
  paidOutgoing: number;
  pendingIncoming: number;
  pendingOutgoing: number;
  balance: number;
};

type Project = { id: string; title: string; slug: string };

type FinanceEntry = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
  title: string;
  description: string | null;
  category: string;
  isArchived: boolean;
  project: { id: string; title: string; slug: string } | null;
  costCode: { id: string; code: string; name: string } | null;
};

const TYPE_LABELS: Record<Counterparty["type"], string> = {
  LEGAL: "ТОВ / ЮО",
  INDIVIDUAL: "Фіз. особа",
  FOP: "ФОП",
};

const STATUS_LABELS: Record<FinanceEntry["status"], string> = {
  DRAFT: "Чернетка",
  PENDING: "На погодж.",
  APPROVED: "Підтв.",
  PAID: "Оплачено",
};

export function CounterpartyDossier({
  id,
  currentUserRole,
}: {
  id: string;
  currentUserRole: string;
}) {
  const [cp, setCp] = useState<Counterparty | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Counterparty> | null>(null);

  const canEdit = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"].includes(currentUserRole);
  const canDelete = currentUserRole === "SUPER_ADMIN";

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dossierRes, entriesRes] = await Promise.all([
        fetch(`/api/admin/financing/counterparties/${id}`, { cache: "no-store" }),
        fetch(`/api/admin/financing?counterpartyId=${id}&archived=false`, { cache: "no-store" }),
      ]);
      if (!dossierRes.ok) {
        const j = await dossierRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка");
      }
      const dossier = await dossierRes.json();
      setCp(dossier.data);
      setStats(dossier.stats);
      setProjects(dossier.projects ?? []);

      if (entriesRes.ok) {
        const j = await entriesRes.json();
        setEntries(j.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDossier() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/financing/counterparties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Помилка збереження");
        return;
      }
      const j = await res.json();
      setCp(j.data);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function softDelete() {
    if (!confirm("Деактивувати контрагента? Існуючі записи залишаться, але новий ввід буде заблоковано.")) return;
    const res = await fetch(`/api/admin/financing/counterparties/${id}`, { method: "DELETE" });
    if (res.ok) await loadAll();
  }

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    [entries],
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (error || !cp || !stats) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}40`, color: T.danger }}
      >
        {error ?? "Не знайдено"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin-v2/counterparties"
          className="flex items-center gap-1.5 text-[12px] hover:underline"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft size={14} />
          До списку контрагентів
        </Link>
      </div>

      {/* Header card */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Building2 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
                {cp.name}
              </h1>
              {!cp.isActive && (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                >
                  Деактивовано
                </span>
              )}
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                {TYPE_LABELS[cp.type]}
              </span>
              {cp.vatPayer && (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ backgroundColor: T.violetSoft, color: T.violet }}
                >
                  Платник ПДВ
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: T.textSecondary }}>
              {cp.edrpou && <span>ЄДРПОУ/РНОКПП: <strong>{cp.edrpou}</strong></span>}
              {cp.taxId && <span>ІПН: <strong>{cp.taxId}</strong></span>}
              {cp.iban && (
                <span className="flex items-center gap-1.5">
                  <CreditCard size={12} />
                  <code className="text-[11.5px]" style={{ color: T.textPrimary }}>{cp.iban}</code>
                </span>
              )}
              {cp.phone && (
                <a
                  href={`tel:${cp.phone}`}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  <Phone size={12} /> {cp.phone}
                </a>
              )}
              {cp.email && (
                <a
                  href={`mailto:${cp.email}`}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  <Mail size={12} /> {cp.email}
                </a>
              )}
            </div>
            {cp.address && (
              <div className="mt-1 text-[12px]" style={{ color: T.textMuted }}>
                {cp.address}
              </div>
            )}
            {cp.notes && (
              <div
                className="mt-3 rounded-lg px-3 py-2 text-[12.5px]"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                {cp.notes}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {canEdit && !editing && (
              <button
                onClick={() => setEditing({ ...cp })}
                className="rounded-xl px-3 py-2 text-[12px] font-semibold"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.textSecondary,
                }}
              >
                Редагувати
              </button>
            )}
            {canDelete && cp.isActive && (
              <button
                onClick={softDelete}
                className="rounded-xl px-3 py-2 text-[12px] font-semibold"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                title="Деактивувати"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.accentPrimary}40` }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Назва">
              <input
                value={editing.name ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, name: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <Field label="Тип">
              <select
                value={editing.type ?? "LEGAL"}
                onChange={(e) => setEditing((s) => ({ ...s!, type: e.target.value as Counterparty["type"] }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              >
                <option value="LEGAL">ТОВ / ЮО</option>
                <option value="FOP">ФОП</option>
                <option value="INDIVIDUAL">Фіз. особа</option>
              </select>
            </Field>
            <Field label="ЄДРПОУ / РНОКПП">
              <input
                value={editing.edrpou ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, edrpou: e.target.value || null }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <Field label="ІПН">
              <input
                value={editing.taxId ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, taxId: e.target.value || null }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <Field label="IBAN">
              <input
                value={editing.iban ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, iban: e.target.value || null }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                placeholder="UA..."
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <Field label="Платник ПДВ?">
              <label className="flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}>
                <input
                  type="checkbox"
                  checked={editing.vatPayer ?? false}
                  onChange={(e) => setEditing((s) => ({ ...s!, vatPayer: e.target.checked }))}
                />
                <span className="text-sm" style={{ color: T.textPrimary }}>Так</span>
              </label>
            </Field>
            <Field label="Телефон">
              <input
                value={editing.phone ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, phone: e.target.value || null }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <Field label="Email">
              <input
                value={editing.email ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s!, email: e.target.value || null }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Адреса">
                <input
                  value={editing.address ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s!, address: e.target.value || null }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Нотатки">
                <textarea
                  rows={3}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s!, notes: e.target.value || null }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
            >
              Скасувати
            </button>
            <button
              onClick={saveDossier}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Зберегти
            </button>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCell
          label="Загалом надходжень"
          value={stats.totalIncoming}
          icon={<TrendingUp size={12} />}
          tone="good"
        />
        <KpiCell
          label="Загалом виплат"
          value={stats.totalOutgoing}
          icon={<TrendingDown size={12} />}
          tone="bad"
        />
        <KpiCell
          label="Очікує оплати"
          value={stats.pendingOutgoing}
          icon={<Wallet size={12} />}
          tone={stats.pendingOutgoing > 0 ? "warn" : "muted"}
        />
        <KpiCell
          label="Баланс"
          value={stats.balance}
          tone={stats.balance > 0 ? "warn" : stats.balance < 0 ? "good" : "muted"}
          tooltip={stats.balance > 0 ? "Ми винні їм" : stats.balance < 0 ? "Вони винні нам" : "Розрахунки збалансовано"}
        />
      </div>

      {/* Recent projects */}
      {projects.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>
            Проєкти, де зустрічається
          </div>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/admin-v2/projects/${p.slug}`}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
                style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
              >
                {p.title}
                <ExternalLink size={11} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Transactions */}
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
              <th className="px-4 py-3 text-left">Дата</th>
              <th className="px-3 py-3 text-left">Назва</th>
              <th className="px-3 py-3 text-left">Проєкт</th>
              <th className="px-3 py-3 text-left">Стаття</th>
              <th className="px-3 py-3 text-right">Тип</th>
              <th className="px-3 py-3 text-right">Сума</th>
              <th className="px-3 py-3 text-right">Статус</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((e) => (
              <tr key={e.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {format(new Date(e.occurredAt), "d MMM yy", { locale: uk })}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-medium">{e.title}</span>
                  {e.description && (
                    <div className="text-[11px] truncate max-w-[260px]" style={{ color: T.textMuted }}>
                      {e.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  {e.project ? (
                    <Link
                      href={`/admin-v2/projects/${e.project.slug}`}
                      className="hover:underline"
                      style={{ color: T.accentPrimary }}
                    >
                      {e.project.title}
                    </Link>
                  ) : (
                    <span style={{ color: T.textMuted }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  {e.costCode ? (
                    <span className="text-[11px]" style={{ color: T.textSecondary }}>
                      {e.costCode.code} {e.costCode.name}
                    </span>
                  ) : (
                    <span style={{ color: T.textMuted }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-[11px]">
                  <span style={{ color: e.kind === "PLAN" ? T.warning : T.textSecondary }}>
                    {e.kind === "PLAN" ? "План" : "Факт"}
                  </span>
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: e.type === "INCOME" ? T.success : T.warning }}
                >
                  {e.type === "INCOME" ? "+" : "−"}
                  {formatCurrencyCompact(Number(e.amount))}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor:
                        e.status === "PAID"
                          ? T.successSoft
                          : e.status === "APPROVED"
                          ? T.skySoft
                          : e.status === "PENDING"
                          ? T.warningSoft
                          : T.panelSoft,
                      color:
                        e.status === "PAID"
                          ? T.success
                          : e.status === "APPROVED"
                          ? T.sky
                          : e.status === "PENDING"
                          ? T.warning
                          : T.textMuted,
                    }}
                  >
                    {e.status === "PAID" && <CheckCircle2 size={10} className="inline mr-1" />}
                    {STATUS_LABELS[e.status]}
                  </span>
                </td>
              </tr>
            ))}
            {sortedEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                  Жодної операції з цим контрагентом не зафіксовано.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMuted }}>
        <span>Створено: {format(new Date(cp.createdAt), "d MMM yyyy", { locale: uk })}</span>
        <span>·</span>
        <span>Останнє оновлення: {format(new Date(cp.updatedAt), "d MMM yyyy", { locale: uk })}</span>
        <span>·</span>
        <span>Операцій: {stats.count}</span>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  icon,
  tone,
  tooltip,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "muted";
  tooltip?: string;
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
      ? T.danger
      : tone === "warn"
      ? T.warning
      : tone === "muted"
      ? T.textSecondary
      : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      title={tooltip}
    >
      <div
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base font-bold tabular-nums sm:text-lg" style={{ color }}>
        {formatCurrencyCompact(value)}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}
