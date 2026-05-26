"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { SupplierPaymentModal } from "./supplier-payment-modal";
import { RatingStars } from "./rating-stars";
import { SrmReviewsTab } from "./srm-reviews-tab";
import { SrmDocumentsTab } from "./srm-documents-tab";
import { SrmComplianceTab } from "./srm-compliance-tab";
import type { CounterpartyTaxStatusLabel } from "./compliance-badge";

type CounterpartyType = "LEGAL" | "INDIVIDUAL" | "FOP";
type CounterpartyRole = "CLIENT" | "SUPPLIER" | "CONTRACTOR" | "EMPLOYEE" | "OTHER";

type Counterparty = {
  id: string;
  name: string;
  type: CounterpartyType;
  roles: CounterpartyRole[];
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
  // SRM rev.1 (optional — додаються після SRM міграції; null-safe)
  avgRating?: number | string | null;
  totalReviews?: number;
  totalProjects?: number;
  taxStatus?: CounterpartyTaxStatusLabel;
  taxStatusCheckedAt?: string | null;
  licenseNumber?: string | null;
  licenseValidUntil?: string | null;
  specializations?: string[];
  legalForm?: string | null;
};

type DossierTab = "overview" | "reviews" | "documents" | "compliance";

type Stats = {
  count: number;
  totalIncoming: number;
  totalOutgoing: number;
  paidIncoming: number;
  paidOutgoing: number;
  pendingIncoming: number;
  pendingOutgoing: number;
  balance: number;
  outstanding: number;
};

type Project = { id: string; title: string; slug: string };

type DebtByProject = {
  projectId: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
  outstanding: number;
  entryCount: number;
};

type DebtByMaterial = {
  name: string;
  outstanding: number;
  count: number;
};

type SupplierPayment = {
  id: string;
  amount: number | string;
  currency: string;
  occurredAt: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD";
  reference: string | null;
  status: "POSTED" | "VOIDED";
  voidedAt: string | null;
  project: { id: string; title: string; slug: string } | null;
  _count: { allocations: number };
};

type SupplierMaterial = {
  id: string;
  name: string;
  unit: string | null;
  lastPrice: string | number | null;
  lastSeenAt: string | null;
  priceHistory?: Array<{ id: string; price: string | number; observedAt: string }>;
};

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

const TYPE_LABELS: Record<CounterpartyType, string> = {
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

function taxLabel(type: CounterpartyType): string {
  return type === "LEGAL" ? "ЄДРПОУ" : "РНОКПП";
}

type FieldKey =
  | "name"
  | "type"
  | "edrpou"
  | "taxId"
  | "iban"
  | "vatPayer"
  | "phone"
  | "email"
  | "address"
  | "notes"
  | "isActive";

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
  const [debtByProject, setDebtByProject] = useState<DebtByProject[]>([]);
  const [debtByMaterial, setDebtByMaterial] = useState<DebtByMaterial[]>([]);
  const [recentPayments, setRecentPayments] = useState<SupplierPayment[]>([]);
  const [supplierMaterials, setSupplierMaterials] = useState<SupplierMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);

  const [paymentModal, setPaymentModal] = useState<{
    projectId: string | null;
    projectTitle: string | null;
    outstandingHint: number;
  } | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DossierTab>("overview");

  const canEdit = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"].includes(currentUserRole);
  const canDelete = currentUserRole === "SUPER_ADMIN";
  const canToggleActive = ["SUPER_ADMIN", "MANAGER"].includes(currentUserRole);
  const canPay = ["SUPER_ADMIN", "MANAGER", "FINANCIER"].includes(currentUserRole);
  const canVoid = ["SUPER_ADMIN", "FINANCIER"].includes(currentUserRole);
  const hideSalary = currentUserRole === "HR";

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dossierRes, entriesRes, materialsRes] = await Promise.all([
        fetch(`/api/admin/financing/counterparties/${id}`, { cache: "no-store" }),
        fetch(`/api/admin/financing?counterpartyId=${id}&archived=false`, { cache: "no-store" }),
        fetch(`/api/admin/financing/supplier-materials?counterpartyId=${id}&withHistory=true`, {
          cache: "no-store",
        }),
      ]);
      if (!dossierRes.ok) {
        const j = await dossierRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка");
      }
      const dossier = await dossierRes.json();
      setCp(dossier.data);
      setStats(dossier.stats);
      setProjects(dossier.projects ?? []);
      setDebtByProject(dossier.outstandingByProject ?? []);
      setDebtByMaterial(dossier.outstandingByMaterial ?? []);
      setRecentPayments(dossier.recentPayments ?? []);

      if (entriesRes.ok) {
        const j = await entriesRes.json();
        setEntries(j.data ?? []);
      }

      if (materialsRes.ok) {
        const j = await materialsRes.json();
        setSupplierMaterials(j.data ?? []);
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

  async function patchField(field: FieldKey, value: unknown) {
    if (!cp) return;
    const current = cp[field];
    if (current === value) {
      setEditingField(null);
      return;
    }
    setSavingField(field);
    try {
      const res = await fetch(`/api/admin/financing/counterparties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Помилка збереження");
        return;
      }
      const j = await res.json();
      setCp(j.data);
    } finally {
      setSavingField(null);
      setEditingField(null);
    }
  }

  async function softDelete() {
    if (!confirm("Деактивувати контрагента? Існуючі записи залишаться, але новий ввід буде заблоковано.")) return;
    const res = await fetch(`/api/admin/financing/counterparties/${id}`, { method: "DELETE" });
    if (res.ok) await loadAll();
  }

  async function voidPayment(paymentId: string) {
    if (!confirm("Скасувати цей платіж? Розподіл буде скинуто, статус зачеплених фактів повернеться у APPROVED.")) {
      return;
    }
    setVoidingId(paymentId);
    try {
      const res = await fetch(`/api/admin/financing/supplier-payments/${paymentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Помилка скасування");
        return;
      }
      await loadAll();
    } finally {
      setVoidingId(null);
    }
  }

  const isSupplier = (cp?.roles ?? []).includes("SUPPLIER");
  const totalOutstanding = stats?.outstanding ?? 0;

  const visibleEntries = useMemo(
    () => (hideSalary ? entries.filter((e) => e.category !== "salary") : entries),
    [entries, hideSalary],
  );

  const sortedEntries = useMemo(
    () =>
      [...visibleEntries].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    [visibleEntries],
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

      {/* Slim header */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          <Building2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: T.textPrimary }}>
              {cp.name}
            </h1>
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
            {!cp.isActive && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              >
                Деактивовано
              </span>
            )}
          </div>
        </div>
        {cp.avgRating != null && (
          <div className="ml-auto sm:ml-0">
            <RatingStars value={cp.avgRating} />
            {(cp.totalReviews ?? 0) > 0 && (
              <span className="ml-1 text-[11px]" style={{ color: T.textMuted }}>
                ({cp.totalReviews} відг.)
              </span>
            )}
          </div>
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

      {/* SRM tabs */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-2xl p-1"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {(
          [
            { key: "overview", label: "Огляд" },
            { key: "reviews", label: "Відгуки" },
            { key: "documents", label: "Документи" },
            { key: "compliance", label: "Compliance" },
          ] as Array<{ key: DossierTab; label: string }>
        ).map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                backgroundColor: active ? T.accentPrimary : "transparent",
                color: active ? "white" : T.textSecondary,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "reviews" && (
        <SrmReviewsTab
          counterpartyId={cp.id}
          canWrite={canEdit}
          projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      {activeTab === "documents" && (
        <SrmDocumentsTab counterpartyId={cp.id} canWrite={canEdit} />
      )}

      {activeTab === "compliance" && (
        <SrmComplianceTab
          counterpartyId={cp.id}
          canWrite={canEdit}
          initial={{
            taxStatus: cp.taxStatus ?? "UNKNOWN",
            taxStatusCheckedAt: cp.taxStatusCheckedAt ?? null,
            edrpou: cp.edrpou,
            licenseNumber: cp.licenseNumber ?? null,
            licenseValidUntil: cp.licenseValidUntil ?? null,
          }}
        />
      )}

      {activeTab === "overview" && (
        <>
      {/* Property table */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
          <tbody>
            <PropertyRow
              label="Назва"
              field="name"
              value={cp.name}
              renderValue={(v) => <span className="font-medium">{v as string}</span>}
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.name}
                  onCommit={(v) => stop(v.trim())}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "name"}
              saving={savingField === "name"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("name")}
              onCommit={(v) => patchField("name", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Тип"
              field="type"
              value={cp.type}
              renderValue={() => (
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase"
                  style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
                >
                  {TYPE_LABELS[cp.type]}
                </span>
              )}
              renderEditor={(stop) => (
                <select
                  autoFocus
                  defaultValue={cp.type}
                  onChange={(e) => stop(e.target.value as CounterpartyType)}
                  onBlur={(e) => stop(e.target.value as CounterpartyType)}
                  className="rounded-lg px-2 py-1 text-sm outline-none"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                >
                  <option value="LEGAL">ТОВ / ЮО</option>
                  <option value="FOP">ФОП</option>
                  <option value="INDIVIDUAL">Фіз. особа</option>
                </select>
              )}
              editing={editingField === "type"}
              saving={savingField === "type"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("type")}
              onCommit={(v) => patchField("type", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label={taxLabel(cp.type)}
              field="edrpou"
              value={cp.edrpou}
              renderValue={(v) => <span style={{ color: T.textSecondary }}>{(v as string) || "—"}</span>}
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.edrpou ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "edrpou"}
              saving={savingField === "edrpou"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("edrpou")}
              onCommit={(v) => patchField("edrpou", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="ІПН"
              field="taxId"
              value={cp.taxId}
              renderValue={(v) => <span style={{ color: T.textSecondary }}>{(v as string) || "—"}</span>}
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.taxId ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "taxId"}
              saving={savingField === "taxId"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("taxId")}
              onCommit={(v) => patchField("taxId", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="IBAN"
              field="iban"
              value={cp.iban}
              renderValue={(v) =>
                v ? (
                  <code className="text-[12px]" style={{ color: T.textPrimary }}>
                    {v as string}
                  </code>
                ) : (
                  <span style={{ color: T.textMuted }}>—</span>
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.iban ?? ""}
                  placeholder="UA..."
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "iban"}
              saving={savingField === "iban"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("iban")}
              onCommit={(v) => patchField("iban", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Платник ПДВ"
              field="vatPayer"
              value={cp.vatPayer}
              renderValue={(v) => (
                <span style={{ color: v ? T.violet : T.textMuted }}>{v ? "Так" : "Ні"}</span>
              )}
              editing={false}
              saving={savingField === "vatPayer"}
              canEdit={canEdit}
              onStartEdit={() => {
                if (savingField) return;
                void patchField("vatPayer", !cp.vatPayer);
              }}
              onCommit={() => undefined}
              onCancel={() => undefined}
              renderEditor={() => null}
            />
            <PropertyRow
              label="Телефон"
              field="phone"
              value={cp.phone}
              renderValue={(v) =>
                v ? (
                  <a href={`tel:${v}`} className="hover:underline" style={{ color: T.textSecondary }}>
                    {v as string}
                  </a>
                ) : (
                  <span style={{ color: T.textMuted }}>—</span>
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.phone ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "phone"}
              saving={savingField === "phone"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("phone")}
              onCommit={(v) => patchField("phone", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Email"
              field="email"
              value={cp.email}
              renderValue={(v) =>
                v ? (
                  <a href={`mailto:${v}`} className="hover:underline" style={{ color: T.textSecondary }}>
                    {v as string}
                  </a>
                ) : (
                  <span style={{ color: T.textMuted }}>—</span>
                )
              }
              renderEditor={(stop) => (
                <TextEditor
                  type="email"
                  initial={cp.email ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "email"}
              saving={savingField === "email"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("email")}
              onCommit={(v) => patchField("email", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Адреса"
              field="address"
              value={cp.address}
              renderValue={(v) => <span style={{ color: T.textSecondary }}>{(v as string) || "—"}</span>}
              renderEditor={(stop) => (
                <TextEditor
                  initial={cp.address ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "address"}
              saving={savingField === "address"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("address")}
              onCommit={(v) => patchField("address", v)}
              onCancel={() => setEditingField(null)}
            />
            <PropertyRow
              label="Нотатки"
              field="notes"
              value={cp.notes}
              renderValue={(v) =>
                v ? (
                  <span style={{ color: T.textSecondary }}>{v as string}</span>
                ) : (
                  <span style={{ color: T.textMuted }}>—</span>
                )
              }
              renderEditor={(stop) => (
                <TextareaEditor
                  initial={cp.notes ?? ""}
                  onCommit={(v) => stop(v.trim() || null)}
                  onCancel={() => stop(undefined)}
                />
              )}
              editing={editingField === "notes"}
              saving={savingField === "notes"}
              canEdit={canEdit}
              onStartEdit={() => setEditingField("notes")}
              onCommit={(v) => patchField("notes", v)}
              onCancel={() => setEditingField(null)}
            />
            {canToggleActive && (
              <PropertyRow
                label="Активний"
                field="isActive"
                value={cp.isActive}
                renderValue={(v) => (
                  <span style={{ color: v ? T.success : T.textMuted }}>{v ? "Так" : "Ні"}</span>
                )}
                editing={false}
                saving={savingField === "isActive"}
                canEdit={canEdit}
                onStartEdit={() => {
                  if (savingField) return;
                  void patchField("isActive", !cp.isActive);
                }}
                onCommit={() => undefined}
                onCancel={() => undefined}
                renderEditor={() => null}
              />
            )}
          </tbody>
        </table>
      </div>

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

      {/* Supplier debt — total + Pay button */}
      {(isSupplier || totalOutstanding > 0) && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl p-4"
          style={{
            backgroundColor: totalOutstanding > 0 ? T.dangerSoft : T.panel,
            border: `1px solid ${totalOutstanding > 0 ? `${T.danger}40` : T.borderSoft}`,
          }}
        >
          <div className="flex items-center gap-2">
            <Wallet
              size={18}
              style={{ color: totalOutstanding > 0 ? T.danger : T.textMuted }}
            />
            <span
              className="text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Заборгованість постачальнику
            </span>
          </div>
          <div className="flex-1" />
          <div
            className="text-2xl font-bold tabular-nums"
            style={{ color: totalOutstanding > 0 ? T.danger : T.textMuted }}
          >
            {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "0 ₴"}
          </div>
          {canPay && totalOutstanding > 0 && (
            <button
              onClick={() =>
                setPaymentModal({
                  projectId: null,
                  projectTitle: null,
                  outstandingHint: totalOutstanding,
                })
              }
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              <Wallet size={13} /> Внести оплату
            </button>
          )}
        </div>
      )}

      {/* Borg by project */}
      {debtByProject.length > 0 && (
        <div
          className="rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div
            className="px-4 pt-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Борг по проєктах
          </div>
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <tbody>
              {debtByProject.map((d) => (
                <tr
                  key={d.projectId ?? "__none__"}
                  className="border-t"
                  style={{ borderColor: T.borderSoft }}
                >
                  <td className="px-4 py-2.5">
                    {d.projectId ? (
                      <Link
                        href={`/admin-v2/projects/${d.projectSlug ?? d.projectId}`}
                        className="font-medium hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {d.projectTitle ?? "Проєкт"}
                      </Link>
                    ) : (
                      <span style={{ color: T.textMuted }}>Без проєкту</span>
                    )}
                    <span
                      className="ml-2 text-[11px]"
                      style={{ color: T.textMuted }}
                    >
                      {d.entryCount} {d.entryCount === 1 ? "запис" : "записів"}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-right tabular-nums font-semibold"
                    style={{ color: T.danger }}
                  >
                    {formatCurrency(d.outstanding)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canPay && (
                      <button
                        onClick={() =>
                          setPaymentModal({
                            projectId: d.projectId,
                            projectTitle: d.projectTitle,
                            outstandingHint: d.outstanding,
                          })
                        }
                        className="rounded-lg px-3 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: T.accentPrimarySoft,
                          color: T.accentPrimary,
                        }}
                      >
                        Оплатити
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Borg by material (Phase 1: groupBy title) */}
      {debtByMaterial.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div
            className="text-[10.5px] font-bold uppercase tracking-wider mb-2"
            style={{ color: T.textMuted }}
          >
            Борг по матеріалах
          </div>
          <div className="flex flex-col gap-1">
            {debtByMaterial.slice(0, 12).map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between gap-3 text-[12.5px] px-2 py-1.5 rounded-lg"
                style={{ backgroundColor: T.panelSoft }}
              >
                <span className="truncate flex-1" style={{ color: T.textPrimary }}>
                  {m.name}
                </span>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  {m.count}×
                </span>
                <span
                  className="tabular-nums font-semibold whitespace-nowrap"
                  style={{ color: T.danger }}
                >
                  {formatCurrency(m.outstanding)}
                </span>
              </div>
            ))}
            {debtByMaterial.length > 12 && (
              <div
                className="text-[11px] mt-1 text-center"
                style={{ color: T.textMuted }}
              >
                + ще {debtByMaterial.length - 12}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Supplier materials catalog (Phase 3) */}
      {supplierMaterials.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center justify-between mb-2">
            <div
              className="text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Довідник матеріалів постачальника
            </div>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              {supplierMaterials.length} {supplierMaterials.length === 1 ? "матеріал" : "матеріалів"}
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {supplierMaterials.slice(0, 30).map((m) => {
              const lastPrice = m.lastPrice !== null ? Number(m.lastPrice) : null;
              const history = m.priceHistory ?? [];
              // Phase 3: показуємо стрілку тренду якщо є попередня ціна.
              const prev =
                history.length > 1 ? Number(history[1].price) : null;
              const delta =
                lastPrice !== null && prev !== null && prev > 0
                  ? (lastPrice - prev) / prev
                  : null;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: T.panelSoft }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12.5px] font-medium truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {m.name}
                    </div>
                    <div className="text-[10px]" style={{ color: T.textMuted }}>
                      {m.unit ?? "—"}
                      {m.lastSeenAt
                        ? ` · ${format(new Date(m.lastSeenAt), "d MMM yy", { locale: uk })}`
                        : ""}
                      {history.length > 1 ? ` · ${history.length} спостережень` : ""}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {lastPrice !== null ? (
                      <div
                        className="text-[13px] font-bold tabular-nums"
                        style={{ color: T.textPrimary }}
                      >
                        {formatCurrency(lastPrice)}
                      </div>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    )}
                    {delta !== null && Math.abs(delta) >= 0.01 && (
                      <div
                        className="text-[10.5px] font-semibold"
                        style={{
                          color: delta > 0 ? T.danger : T.success,
                        }}
                        title={
                          prev !== null
                            ? `Раніше: ${formatCurrency(prev)}`
                            : undefined
                        }
                      >
                        {delta > 0 ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {supplierMaterials.length > 30 && (
            <div
              className="text-[11px] mt-2 text-center"
              style={{ color: T.textMuted }}
            >
              + ще {supplierMaterials.length - 30}
            </div>
          )}
        </div>
      )}

      {/* Payments history */}
      {recentPayments.length > 0 && (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div
            className="px-4 pt-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Платежі постачальнику
          </div>
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                <th className="px-4 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Метод</th>
                <th className="px-3 py-2 text-left">Проєкт</th>
                <th className="px-3 py-2 text-left">№ платіжки</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-right">Алок.</th>
                <th className="px-3 py-2 text-right">Статус</th>
                {canVoid && <th className="px-3 py-2 text-right" />}
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((p) => (
                <tr
                  key={p.id}
                  className="border-t"
                  style={{
                    borderColor: T.borderSoft,
                    opacity: p.status === "VOIDED" ? 0.5 : 1,
                  }}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {format(new Date(p.occurredAt), "d MMM yy", { locale: uk })}
                  </td>
                  <td className="px-3 py-2 text-[12px]" style={{ color: T.textSecondary }}>
                    {p.method === "CASH" ? "Готівка" : p.method === "CARD" ? "Картка" : "Безгот."}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {p.project ? (
                      <Link
                        href={`/admin-v2/projects/${p.project.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {p.project.title}
                      </Link>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[12px]" style={{ color: T.textSecondary }}>
                    {p.reference || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatCurrency(Number(p.amount))}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px]" style={{ color: T.textMuted }}>
                    {p._count.allocations}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.status === "POSTED" ? (
                      <span
                        className="text-[10px] font-bold rounded px-1.5 py-0.5"
                        style={{ backgroundColor: T.successSoft, color: T.success }}
                      >
                        Проведено
                      </span>
                    ) : (
                      <span
                        className="text-[10px] font-bold rounded px-1.5 py-0.5"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        Скасовано
                      </span>
                    )}
                  </td>
                  {canVoid && (
                    <td className="px-3 py-2 text-right">
                      {p.status === "POSTED" && (
                        <button
                          onClick={() => voidPayment(p.id)}
                          disabled={voidingId === p.id}
                          className="rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
                          title="Скасувати платіж"
                        >
                          {voidingId === p.id ? (
                            <Loader2 size={13} className="animate-spin" style={{ color: T.textMuted }} />
                          ) : (
                            <AlertTriangle size={13} style={{ color: T.danger }} />
                          )}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment modal */}
      {cp && paymentModal && (
        <SupplierPaymentModal
          open={true}
          counterpartyId={cp.id}
          counterpartyName={cp.name}
          projectId={paymentModal.projectId}
          projectTitle={paymentModal.projectTitle}
          outstandingHint={paymentModal.outstandingHint}
          onClose={() => setPaymentModal(null)}
          onCreated={async () => {
            setPaymentModal(null);
            await loadAll();
          }}
        />
      )}

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
        </>
      )}
    </div>
  );
}

function PropertyRow({
  label,
  value,
  renderValue,
  renderEditor,
  editing,
  saving,
  canEdit,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  label: string;
  field: FieldKey;
  value: unknown;
  renderValue: (v: unknown) => React.ReactNode;
  renderEditor: (stop: (next: unknown | undefined) => void) => React.ReactNode;
  editing: boolean;
  saving: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  function stop(next: unknown | undefined) {
    if (next === undefined) {
      onCancel();
    } else {
      onCommit(next);
    }
  }
  return (
    <tr className="border-t" style={{ borderColor: T.borderSoft }}>
      <th
        scope="row"
        className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider align-middle w-[180px]"
        style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
      >
        {label}
      </th>
      <td
        className={`px-3 py-2.5 align-middle ${canEdit ? "cursor-pointer hover:bg-black/5" : ""}`}
        onClick={() => {
          if (!canEdit || editing || saving) return;
          onStartEdit();
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {editing ? renderEditor(stop) : renderValue(value)}
          </div>
          {saving && <Loader2 size={12} className="animate-spin" style={{ color: T.textMuted }} />}
          {!editing && !saving && canEdit && (
            <Pencil size={11} className="opacity-0 group-hover:opacity-100" style={{ color: T.textMuted }} />
          )}
        </div>
      </td>
    </tr>
  );
}

function TextEditor({
  initial,
  type = "text",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  type?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      type={type}
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded-lg px-2 py-1 text-sm outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}

function TextareaEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      autoFocus
      rows={3}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded-lg px-2 py-1.5 text-sm outline-none resize-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
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
