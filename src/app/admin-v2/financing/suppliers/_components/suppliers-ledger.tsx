"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Truck,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { SupplierPaymentModal } from "@/app/admin-v2/counterparties/_components/supplier-payment-modal";
import { AddInvoiceModal } from "./add-invoice-modal";

type Supplier = {
  id: string;
  name: string;
  edrpou: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  // From withOutstanding:
  outstanding: number;
  oldestDebtDate: string | null;
  // From withStats:
  invoiceCount: number;
  paidCount: number;
  debtCount: number;
  totalInvoiced: number;
  totalPaid: number;
  firstInvoiceDate: string | null;
  lastInvoiceDate: string | null;
  lastPaymentDate: string | null;
};

type Invoice = {
  id: string;
  occurredAt: string;
  title: string;
  description: string | null;
  invoiceNumber: string | null;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
  paidAt: string | null;
  remindAt: string | null;
  project: { id: string; title: string; slug: string } | null;
};

type SortKey =
  | "outstanding"
  | "name"
  | "totalInvoiced"
  | "totalPaid"
  | "lastInvoiceDate"
  | "lastPaymentDate"
  | "invoiceCount"
  | "oldestDebt";

const PAY_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);
const CREATE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"]);

const dateFmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
};

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

export function SuppliersLedger({ currentUserRole }: { currentUserRole: string }) {
  const canPay = PAY_ROLES.has(currentUserRole);
  const canCreate = CREATE_ROLES.has(currentUserRole);

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showOnlyDebt, setShowOnlyDebt] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [payTarget, setPayTarget] = useState<Supplier | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addInvoiceFor, setAddInvoiceFor] = useState<{
    counterpartyId: string | null;
  } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [invoicesByCp, setInvoicesByCp] = useState<Map<string, Invoice[]>>(
    new Map(),
  );
  const [loadingInvoicesId, setLoadingInvoicesId] = useState<string | null>(
    null,
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("role", "SUPPLIER");
      params.set("withOutstanding", "true");
      params.set("withStats", "true");
      params.set("take", "500");
      if (showOnlyDebt) params.set("hasDebt", "true");
      if (includeInactive) params.set("includeInactive", "true");
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/admin/financing/counterparties?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setItems(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyDebt, includeInactive, dateFrom, dateTo]);

  // Deep-link: дашборд фінансиста має кнопку «+ Накладна» з `?action=new-invoice`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("action") === "new-invoice") {
      setAddInvoiceFor({ counterpartyId: null });
      // прибираємо параметр щоб модалка не відкривалася при наступному рендері
      sp.delete("action");
      const next = `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const { creditors, others } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? items
      : items.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.edrpou ?? "").toLowerCase().includes(q),
        );
    const cr = filtered.filter((c) => c.outstanding > 0);
    const ot = filtered.filter((c) => c.outstanding === 0);
    const sortFn = (a: Supplier, b: Supplier) => {
      const dir = sortDir === "desc" ? -1 : 1;
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "uk") * dir;
        case "totalInvoiced":
          return (a.totalInvoiced - b.totalInvoiced) * dir;
        case "totalPaid":
          return (a.totalPaid - b.totalPaid) * dir;
        case "invoiceCount":
          return (a.invoiceCount - b.invoiceCount) * dir;
        case "lastInvoiceDate": {
          const av = a.lastInvoiceDate ? new Date(a.lastInvoiceDate).getTime() : 0;
          const bv = b.lastInvoiceDate ? new Date(b.lastInvoiceDate).getTime() : 0;
          return (av - bv) * dir;
        }
        case "lastPaymentDate": {
          const av = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
          const bv = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
          return (av - bv) * dir;
        }
        case "oldestDebt": {
          const av = a.oldestDebtDate ? new Date(a.oldestDebtDate).getTime() : 0;
          const bv = b.oldestDebtDate ? new Date(b.oldestDebtDate).getTime() : 0;
          return (av - bv) * dir;
        }
        case "outstanding":
        default:
          return (a.outstanding - b.outstanding) * dir;
      }
    };
    return { creditors: [...cr].sort(sortFn), others: [...ot].sort(sortFn) };
  }, [items, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const totalDebt = creditors.reduce((s, c) => s + c.outstanding, 0);
    const totalInvoiced = items.reduce((s, c) => s + c.totalInvoiced, 0);
    const totalPaid = items.reduce((s, c) => s + c.totalPaid, 0);
    const overdue30 = creditors.filter((c) => {
      const days = daysSince(c.oldestDebtDate);
      return days !== null && days >= 30;
    }).length;
    return {
      totalDebt,
      totalInvoiced,
      totalPaid,
      debtorCount: creditors.length,
      overdue30,
    };
  }, [items, creditors]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (invoicesByCp.has(id)) return;
    setLoadingInvoicesId(id);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${id}/invoices?take=200`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const j = await res.json();
      setInvoicesByCp((prev) => {
        const next = new Map(prev);
        next.set(id, j.data ?? []);
        return next;
      });
    } finally {
      setLoadingInvoicesId(null);
    }
  }

  async function submitCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Назва обовʼязкова");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const createRes = await fetch(`/api/admin/financing/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "LEGAL" }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        setCreateError(createJson.error ?? "Помилка створення");
        return;
      }
      setShowCreate(false);
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function clearDates() {
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile
          label="Кредиторів"
          value={totals.debtorCount}
          sub={`з ${items.length} постач.`}
          kind="count"
          tone={totals.debtorCount > 0 ? "bad" : "good"}
        />
        <Tile
          label="Загальний борг"
          value={totals.totalDebt}
          kind="money"
          tone={totals.totalDebt > 0 ? "bad" : "good"}
        />
        <Tile
          label="Просрочка >30 днів"
          value={totals.overdue30}
          kind="count"
          tone={totals.overdue30 > 0 ? "warn" : "muted"}
        />
        <Tile label="Оплачено" value={totals.totalPaid} kind="money" tone="good" />
        <Tile
          label="Оборот"
          value={totals.totalInvoiced}
          kind="money"
          tone="muted"
        />
      </div>

      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук — назва / ЄДРПОУ…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
          <span style={{ color: T.textMuted }}>Дата рахунку:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md px-2 py-1 outline-none text-[12px]"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
              colorScheme: "light",
            }}
          />
          <span>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md px-2 py-1 outline-none text-[12px]"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
              colorScheme: "light",
            }}
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={clearDates}
              className="rounded p-1 hover:bg-black/10"
              title="Скинути дати"
            >
              <X size={12} style={{ color: T.textMuted }} />
            </button>
          )}
        </div>

        <label
          className="flex items-center gap-1.5 text-[12px] cursor-pointer"
          style={{ color: T.textSecondary }}
        >
          <input
            type="checkbox"
            checked={showOnlyDebt}
            onChange={(e) => setShowOnlyDebt(e.target.checked)}
          />
          Тільки з боргом
        </label>
        <label
          className="flex items-center gap-1.5 text-[12px] cursor-pointer"
          style={{ color: T.textSecondary }}
        >
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Деактивовані
        </label>
        <div className="flex-1" />
        {canPay && (
          <button
            onClick={() => setAddInvoiceFor({ counterpartyId: null })}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Plus size={13} /> Накладна
          </button>
        )}
        {canCreate && (
          <button
            onClick={() => {
              setShowCreate(true);
              setNewName("");
              setCreateError(null);
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Plus size={13} /> Новий постачальник
          </button>
        )}
      </div>

      {showCreate && (
        <CreateForm
          name={newName}
          setName={setNewName}
          onSubmit={submitCreate}
          onCancel={() => setShowCreate(false)}
          busy={creating}
          error={createError}
        />
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}40`,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm"
          style={{ color: T.textMuted }}
        >
          <Loader2 size={14} className="animate-spin" /> Завантажуємо…
        </div>
      ) : (
        <>
          {creditors.length > 0 && (
            <SectionTable
              title={
                <>
                  <AlertTriangle size={14} style={{ color: T.danger }} />
                  <span style={{ color: T.danger }}>
                    Кредитори ({creditors.length}) — {formatCurrency(totals.totalDebt)}
                  </span>
                </>
              }
              rows={creditors}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={clickSort}
              expandedId={expandedId}
              onToggle={toggleExpand}
              invoicesByCp={invoicesByCp}
              loadingInvoicesId={loadingInvoicesId}
              canPay={canPay}
              onPay={setPayTarget}
              variant="creditors"
            />
          )}

          {others.length > 0 && !showOnlyDebt && (
            <SectionTable
              title={
                <>
                  <CheckCircle2 size={14} style={{ color: T.success }} />
                  <span style={{ color: T.textSecondary }}>
                    Без поточного боргу ({others.length})
                  </span>
                </>
              }
              rows={others}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={clickSort}
              expandedId={expandedId}
              onToggle={toggleExpand}
              invoicesByCp={invoicesByCp}
              loadingInvoicesId={loadingInvoicesId}
              canPay={canPay}
              onPay={setPayTarget}
              variant="others"
            />
          )}

          {creditors.length === 0 && others.length === 0 && (
            <div
              className="rounded-2xl p-8 text-center text-sm"
              style={{
                backgroundColor: T.panel,
                border: `1px dashed ${T.borderSoft}`,
                color: T.textMuted,
              }}
            >
              Постачальників не знайдено.
            </div>
          )}
        </>
      )}

      {payTarget && (
        <SupplierPaymentModal
          open={true}
          counterpartyId={payTarget.id}
          counterpartyName={payTarget.name}
          outstandingHint={payTarget.outstanding}
          onClose={() => setPayTarget(null)}
          onCreated={async () => {
            setPayTarget(null);
            // Сбросити кеш рахунків цього постачальника, бо outstanding змінився.
            setInvoicesByCp((prev) => {
              const next = new Map(prev);
              next.delete(payTarget.id);
              return next;
            });
            await load();
          }}
        />
      )}

      {addInvoiceFor && (
        <AddInvoiceModal
          presetCounterpartyId={addInvoiceFor.counterpartyId}
          onClose={() => setAddInvoiceFor(null)}
          onCreated={async () => {
            const target = addInvoiceFor.counterpartyId;
            setAddInvoiceFor(null);
            // Сбросити кеш рахунків (outstanding змінився).
            if (target) {
              setInvoicesByCp((prev) => {
                const next = new Map(prev);
                next.delete(target);
                return next;
              });
            } else {
              setInvoicesByCp(new Map());
            }
            await load();
          }}
        />
      )}
    </div>
  );
}

function SectionTable({
  title,
  rows,
  sortKey,
  sortDir,
  onSort,
  expandedId,
  onToggle,
  invoicesByCp,
  loadingInvoicesId,
  canPay,
  onPay,
  variant,
}: {
  title: React.ReactNode;
  rows: Supplier[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  invoicesByCp: Map<string, Invoice[]>;
  loadingInvoicesId: string | null;
  canPay: boolean;
  onPay: (s: Supplier) => void;
  variant: "creditors" | "others";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex items-center gap-1.5 px-1 text-[12px] font-bold"
      >
        {title}
      </div>
      <div
        className="overflow-x-auto rounded-2xl"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${variant === "creditors" ? T.danger + "40" : T.borderStrong}`,
        }}
      >
        <table
          className="w-full text-[12.5px] table-fixed"
          style={{ color: T.textPrimary, minWidth: 1200 }}
        >
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 38 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
            >
              <th></th>
              <th className="px-2 py-2.5 text-left">#</th>
              <SortableTh
                label="Постачальник"
                k="name"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="left"
              />
              <SortableTh
                label="Рах."
                k="invoiceCount"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Оборот"
                k="totalInvoiced"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Оплачено"
                k="totalPaid"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Борг"
                k="outstanding"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Прострочка"
                k="oldestDebt"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Ост. рахунок"
                k="lastInvoiceDate"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <SortableTh
                label="Ост. платіж"
                k="lastPaymentDate"
                active={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              />
              <th className="px-3 py-2.5 text-right">Дії</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const isOpen = expandedId === c.id;
              const invoices = invoicesByCp.get(c.id);
              return (
                <Row
                  key={c.id}
                  supplier={c}
                  rank={i + 1}
                  isOpen={isOpen}
                  invoices={invoices}
                  loadingInvoices={loadingInvoicesId === c.id}
                  canPay={canPay}
                  onToggle={() => onToggle(c.id)}
                  onPay={() => onPay(c)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  k,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align: "left" | "right";
}) {
  const isActive = active === k;
  return (
    <th className={`px-3 py-2.5 text-${align} whitespace-nowrap`}>
      <button
        onClick={() => onClick(k)}
        className="inline-flex items-center gap-1 hover:underline"
        style={{
          color: isActive ? T.accentPrimary : T.textMuted,
          fontWeight: isActive ? 700 : 600,
        }}
      >
        {label}
        {isActive ? (
          dir === "desc" ? (
            <ArrowDown size={10} />
          ) : (
            <ArrowUp size={10} />
          )
        ) : (
          <ArrowUpDown size={10} style={{ opacity: 0.4 }} />
        )}
      </button>
    </th>
  );
}

function Row({
  supplier,
  rank,
  isOpen,
  invoices,
  loadingInvoices,
  canPay,
  onToggle,
  onPay,
}: {
  supplier: Supplier;
  rank: number;
  isOpen: boolean;
  invoices: Invoice[] | undefined;
  loadingInvoices: boolean;
  canPay: boolean;
  onToggle: () => void;
  onPay: () => void;
}) {
  const c = supplier;
  const hasDebt = c.outstanding > 0;
  const overdueDays = daysSince(c.oldestDebtDate);
  const overdueColor =
    overdueDays === null
      ? T.textMuted
      : overdueDays >= 60
        ? T.danger
        : overdueDays >= 30
          ? T.warning
          : T.textSecondary;
  const paidPct =
    c.totalInvoiced > 0 ? (c.totalPaid / c.totalInvoiced) * 100 : 0;
  return (
    <>
      <tr
        className="border-t cursor-pointer transition hover:bg-black/[0.02]"
        style={{
          borderColor: T.borderSoft,
          opacity: c.isActive ? 1 : 0.55,
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a, button")) return;
          onToggle();
        }}
      >
        <td className="text-center align-middle">
          {isOpen ? (
            <ChevronDown size={14} style={{ color: T.textMuted, display: "inline" }} />
          ) : (
            <ChevronRight size={14} style={{ color: T.textMuted, display: "inline" }} />
          )}
        </td>
        <td
          className="px-2 py-2.5 text-[11px] tabular-nums"
          style={{ color: T.textMuted }}
        >
          {rank}
        </td>
        <td className="px-3 py-2.5">
          <Link
            href={`/admin-v2/counterparties/${c.id}`}
            className="flex items-center gap-2 hover:underline min-w-0"
            style={{ color: T.textPrimary }}
            onClick={(e) => e.stopPropagation()}
            title={c.name}
          >
            <Truck
              size={13}
              style={{ color: hasDebt ? T.danger : T.textMuted, flexShrink: 0 }}
            />
            <span className="flex flex-col min-w-0 flex-1">
              <span className="font-semibold truncate">{c.name}</span>
              {c.edrpou && (
                <span
                  className="text-[10px] tabular-nums truncate"
                  style={{ color: T.textMuted }}
                >
                  {c.edrpou}
                </span>
              )}
            </span>
          </Link>
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
          style={{ color: T.textSecondary }}
        >
          {c.invoiceCount > 0 ? (
            <span>
              {c.invoiceCount}
              {c.debtCount > 0 && (
                <span
                  className="ml-1 text-[10px] font-bold"
                  style={{ color: T.danger }}
                >
                  · {c.debtCount}
                </span>
              )}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
          style={{ color: T.textPrimary }}
        >
          {c.totalInvoiced > 0 ? formatCurrency(c.totalInvoiced) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
          {c.totalPaid > 0 ? (
            <div className="flex flex-col items-end gap-0.5">
              <span style={{ color: T.success }}>
                {formatCurrency(c.totalPaid)}
              </span>
              {c.totalInvoiced > 0 && (
                <div
                  className="h-[3px] w-14 rounded-full overflow-hidden"
                  style={{ backgroundColor: T.panelSoft }}
                  title={`${paidPct.toFixed(0)}% оплачено`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${paidPct}%`,
                      backgroundColor: T.success,
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: T.textMuted }}>—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
          {hasDebt ? (
            <span className="font-bold" style={{ color: T.danger }}>
              {formatCurrency(c.outstanding)}
            </span>
          ) : (
            <span style={{ color: T.textMuted }}>—</span>
          )}
        </td>
        <td
          className="px-3 py-2.5 text-right text-[11px] whitespace-nowrap tabular-nums"
          style={{ color: overdueColor }}
        >
          {overdueDays === null
            ? "—"
            : overdueDays >= 30
              ? (
                <div className="flex flex-col items-end leading-tight">
                  <span className="font-semibold">{overdueDays} дн</span>
                  <span className="text-[9.5px]" style={{ color: T.textMuted }}>
                    з {dateFmt(c.oldestDebtDate)}
                  </span>
                </div>
              )
              : `${overdueDays} дн`}
        </td>
        <td
          className="px-3 py-2.5 text-right text-[11px] tabular-nums whitespace-nowrap"
          style={{ color: T.textSecondary }}
        >
          {dateFmt(c.lastInvoiceDate)}
        </td>
        <td
          className="px-3 py-2.5 text-right text-[11px] tabular-nums whitespace-nowrap"
          style={{ color: c.lastPaymentDate ? T.textSecondary : T.textMuted }}
        >
          {dateFmt(c.lastPaymentDate)}
        </td>
        <td className="px-2 py-2.5 text-right whitespace-nowrap">
          {canPay && hasDebt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPay();
              }}
              className="rounded-md px-2 py-1 text-[10.5px] font-bold mr-1"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              Оплатити
            </button>
          )}
          <Link
            href={`/admin-v2/counterparties/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10 align-middle"
            title="Відкрити повне досʼє"
          >
            <ExternalLink size={12} style={{ color: T.accentPrimary }} />
          </Link>
        </td>
      </tr>
      {isOpen && (
        <tr style={{ borderColor: T.borderSoft }}>
          <td colSpan={11} className="p-0">
            <InvoicesDrawer
              invoices={invoices}
              loading={loadingInvoices}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function InvoicesDrawer({
  invoices,
  loading,
}: {
  invoices: Invoice[] | undefined;
  loading: boolean;
}) {
  if (loading || !invoices) {
    return (
      <div
        className="px-6 py-4 text-[12px]"
        style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
      >
        <Loader2 size={12} className="inline animate-spin mr-1" />
        Завантажуємо рахунки…
      </div>
    );
  }
  if (invoices.length === 0) {
    return (
      <div
        className="px-6 py-4 text-[12px]"
        style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
      >
        Рахунків не знайдено.
      </div>
    );
  }
  const debtCount = invoices.filter((i) => i.outstanding > 0).length;
  return (
    <div className="px-6 py-3" style={{ backgroundColor: T.panelSoft }}>
      <div
        className="text-[10px] font-bold uppercase tracking-wider mb-2"
        style={{ color: T.textMuted }}
      >
        Рахунки ({invoices.length} · {debtCount} з боргом)
      </div>
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <table className="w-full text-[11.5px]">
          <thead>
            <tr style={{ color: T.textMuted }}>
              <th className="px-2 py-1.5 text-left font-semibold">Дата</th>
              <th className="px-2 py-1.5 text-left font-semibold">№ рахунку</th>
              <th className="px-2 py-1.5 text-left font-semibold">Куди / опис</th>
              <th className="px-2 py-1.5 text-left font-semibold">Проєкт</th>
              <th className="px-2 py-1.5 text-right font-semibold">Сума</th>
              <th className="px-2 py-1.5 text-right font-semibold">Оплачено</th>
              <th className="px-2 py-1.5 text-right font-semibold">Залишок</th>
              <th className="px-2 py-1.5 text-left font-semibold">Статус</th>
              <th className="px-2 py-1.5 text-right font-semibold">Дата опл.</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const debt = inv.outstanding > 0;
              const cleanDesc = inv.description
                ?.replace(/^Куди везли:\s*/, "")
                .trim();
              return (
                <tr
                  key={inv.id}
                  style={{ borderTop: `1px solid ${T.borderSoft}` }}
                >
                  <td
                    className="px-2 py-1 tabular-nums whitespace-nowrap"
                    style={{ color: T.textSecondary }}
                  >
                    {dateFmt(inv.occurredAt)}
                  </td>
                  <td
                    className="px-2 py-1 whitespace-nowrap truncate max-w-[120px]"
                    style={{ color: T.textPrimary }}
                    title={inv.invoiceNumber ?? ""}
                  >
                    {inv.invoiceNumber ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 truncate max-w-[260px]"
                    style={{ color: T.textSecondary }}
                    title={cleanDesc ?? ""}
                  >
                    {cleanDesc || "—"}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {inv.project ? (
                      <Link
                        href={`/admin-v2/projects/${inv.project.slug}`}
                        className="hover:underline"
                        style={{ color: T.accentPrimary }}
                      >
                        {inv.project.title}
                      </Link>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    )}
                  </td>
                  <td
                    className="px-2 py-1 text-right tabular-nums"
                    style={{ color: T.textPrimary }}
                  >
                    {formatCurrency(inv.amount)}
                  </td>
                  <td
                    className="px-2 py-1 text-right tabular-nums"
                    style={{
                      color: inv.paidAmount > 0 ? T.success : T.textMuted,
                    }}
                  >
                    {inv.paidAmount > 0
                      ? formatCurrency(inv.paidAmount)
                      : "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-right tabular-nums font-semibold"
                    style={{ color: debt ? T.danger : T.textMuted }}
                  >
                    {debt ? formatCurrency(inv.outstanding) : "—"}
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                      style={{
                        backgroundColor: debt
                          ? T.warningSoft
                          : T.successSoft,
                        color: debt ? T.warning : T.success,
                      }}
                    >
                      {debt ? "БОРГ" : "ОПЛАЧЕНО"}
                    </span>
                  </td>
                  <td
                    className="px-2 py-1 text-right tabular-nums whitespace-nowrap"
                    style={{ color: T.textSecondary }}
                  >
                    {inv.status === "PAID"
                      ? dateFmt(inv.paidAt)
                      : inv.remindAt
                        ? `до ${dateFmt(inv.remindAt)}`
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateForm({
  name,
  setName,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div
      className="rounded-2xl p-3 flex flex-col gap-2"
      style={{
        backgroundColor: T.accentPrimarySoft,
        border: `1px solid ${T.accentPrimary}40`,
      }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Назва постачальника, напр. Будхата"
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderStrong}`,
            color: T.textPrimary,
          }}
        />
        <button
          onClick={onSubmit}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          {busy ? "Створення…" : "Створити"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-[12px] font-semibold"
          style={{
            backgroundColor: T.panel,
            color: T.textSecondary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          Скасувати
        </button>
      </div>
      {error && (
        <div className="text-[11px]" style={{ color: T.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  kind,
  tone = "muted",
}: {
  label: string;
  value: number;
  sub?: string;
  kind: "money" | "count";
  tone?: "good" | "bad" | "warn" | "muted";
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
        ? T.danger
        : tone === "warn"
          ? T.warning
          : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-base font-bold tabular-nums sm:text-lg"
        style={{ color }}
      >
        {kind === "money" ? formatCurrency(value) : value}
      </div>
      {sub && (
        <div
          className="mt-0.5 text-[10px]"
          style={{ color: T.textMuted }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
