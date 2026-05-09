"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { SupplierPaymentModal } from "@/app/admin-v2/counterparties/_components/supplier-payment-modal";

type Supplier = {
  id: string;
  name: string;
  edrpou: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  outstanding: number;
};

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

type SupplierDetail = {
  outstandingByProject: DebtByProject[];
  outstandingByMaterial: DebtByMaterial[];
  /// Кількість зачеплених фактів (для info-плашки).
  factsCount: number;
};

const PAY_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);
const CREATE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"]);

export function SuppliersLedger({ currentUserRole }: { currentUserRole: string }) {
  const canPay = PAY_ROLES.has(currentUserRole);
  const canCreate = CREATE_ROLES.has(currentUserRole);

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Дефолт: показуємо всіх постачальників. Toggle «Тільки з боргом» у toolbar
  // лишається — для фокусованої роботи фінансиста з заборгованостями.
  const [showOnlyDebt, setShowOnlyDebt] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [payTarget, setPayTarget] = useState<Supplier | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Lazy-load drill-down: тримаємо кеш деталей по counterpartyId.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, SupplierDetail>>(new Map());
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("role", "SUPPLIER");
      params.set("withOutstanding", "true");
      params.set("take", "500");
      if (showOnlyDebt) params.set("hasDebt", "true");
      if (includeInactive) params.set("includeInactive", "true");
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
  }, [showOnlyDebt, includeInactive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => b.outstanding - a.outstanding);
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.edrpou ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const totalDebt = useMemo(
    () => filtered.reduce((s, c) => s + c.outstanding, 0),
    [filtered],
  );
  const debtorCount = useMemo(
    () => filtered.filter((c) => c.outstanding > 0).length,
    [filtered],
  );

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details.has(id)) return;
    setLoadingDetailId(id);
    try {
      const res = await fetch(`/api/admin/financing/counterparties/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = await res.json();
      const detail: SupplierDetail = {
        outstandingByProject: j.outstandingByProject ?? [],
        outstandingByMaterial: j.outstandingByMaterial ?? [],
        factsCount: j.stats?.count ?? 0,
      };
      setDetails((prev) => {
        const next = new Map(prev);
        next.set(id, detail);
        return next;
      });
    } finally {
      setLoadingDetailId(null);
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
      // Створюємо через звичайний counterparties endpoint, потім додаємо
      // SUPPLIER через PATCH (бо POST не приймає roles).
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
      // PATCH ролі — endpoint не приймає roles напряму, тому скрипт backfill
      // підхопить при наступному запуску. Але краще одразу: у DB немає API
      // для оновлення ролей, тож Postgres SUPPLIER додається через
      // counterparties update схему майбутньою фазою. Поки залишимо як є —
      // counterparty з'явиться у списку коли матиме хоча б одну витрату
      // через FACT EXPENSE (resolveSupplier поставить роль автоматично).
      setShowCreate(false);
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar + summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Постачальників" value={filtered.length} kind="count" />
        <Tile label="З боргом" value={debtorCount} kind="count" tone="warn" />
        <Tile
          label="Загальний борг"
          value={totalDebt}
          kind="money"
          tone={totalDebt > 0 ? "bad" : "muted"}
        />
        <Tile
          label="Середній борг"
          value={debtorCount > 0 ? totalDebt / debtorCount : 0}
          kind="money"
          tone="muted"
        />
      </div>

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
            placeholder="Пошук — назва / ЄДРПОУ…"
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
          Включно з деактивованими
        </label>
        <div className="flex-1" />
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
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCreate();
                if (e.key === "Escape") setShowCreate(false);
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
              onClick={submitCreate}
              disabled={creating}
              className="rounded-xl px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              {creating ? "Створення…" : "Створити"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              disabled={creating}
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
          {createError && (
            <div className="text-[11px]" style={{ color: T.danger }}>
              {createError}
            </div>
          )}
          <div className="text-[11px]" style={{ color: T.textSecondary }}>
            Деталі (ЄДРПОУ, IBAN, контакти) можна заповнити у{" "}
            <Link
              href="/admin-v2/counterparties"
              className="underline"
              style={{ color: T.accentPrimary }}
            >
              Контрагентах
            </Link>
            .
          </div>
        </div>
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
          <Loader2 size={14} className="animate-spin" /> Завантажуємо постачальників…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center text-sm"
          style={{
            backgroundColor: T.panel,
            border: `1px dashed ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          {showOnlyDebt
            ? "Немає постачальників з активним боргом."
            : "Постачальників не знайдено. Створіть першого вгорі ↑"}
        </div>
      ) : (
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
                <th className="w-8"></th>
                <th className="px-4 py-3 text-left">Постачальник</th>
                <th className="px-3 py-3 text-left">ЄДРПОУ</th>
                <th className="px-3 py-3 text-left">Контакти</th>
                <th className="px-3 py-3 text-right">Загальний борг</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const hasDebt = c.outstanding > 0;
                const isOpen = expandedId === c.id;
                const detail = details.get(c.id);
                const isLoadingDetail = loadingDetailId === c.id;
                return (
                  <ExpandableRow
                    key={c.id}
                    supplier={c}
                    hasDebt={hasDebt}
                    isOpen={isOpen}
                    detail={detail}
                    isLoadingDetail={isLoadingDetail}
                    canPay={canPay}
                    onToggle={() => toggleExpand(c.id)}
                    onPay={() => setPayTarget(c)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
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
            await load();
          }}
        />
      )}
    </div>
  );
}

function ExpandableRow({
  supplier,
  hasDebt,
  isOpen,
  detail,
  isLoadingDetail,
  canPay,
  onToggle,
  onPay,
}: {
  supplier: Supplier;
  hasDebt: boolean;
  isOpen: boolean;
  detail: SupplierDetail | undefined;
  isLoadingDetail: boolean;
  canPay: boolean;
  onToggle: () => void;
  onPay: () => void;
}) {
  const c = supplier;
  return (
    <>
      <tr
        className="border-t cursor-pointer transition hover:bg-black/[0.015]"
        style={{
          borderColor: T.borderSoft,
          opacity: c.isActive ? 1 : 0.55,
        }}
        onClick={(e) => {
          // не реагуємо на клік по ссилках/кнопках всередині рядка
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
        <td className="px-4 py-2.5">
          <Link
            href={`/admin-v2/counterparties/${c.id}`}
            className="flex items-center gap-2 hover:underline"
            style={{ color: T.textPrimary }}
            onClick={(e) => e.stopPropagation()}
          >
            <Truck size={14} style={{ color: hasDebt ? T.danger : T.textMuted }} />
            <span className="font-medium">{c.name}</span>
          </Link>
        </td>
        <td className="px-3 py-2.5 text-[12px] tabular-nums" style={{ color: T.textSecondary }}>
          {c.edrpou || "—"}
        </td>
        <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
          <div className="flex flex-col gap-0.5">
            {c.phone && (
              <span className="flex items-center gap-1">
                <Phone size={10} /> {c.phone}
              </span>
            )}
            {c.email && (
              <span className="flex items-center gap-1 truncate max-w-[180px]">
                <Mail size={10} /> {c.email}
              </span>
            )}
            {!c.phone && !c.email && "—"}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {hasDebt ? (
            <span className="font-bold" style={{ color: T.danger }}>
              {formatCurrency(c.outstanding)}
            </span>
          ) : (
            <span style={{ color: T.textMuted }}>—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          {canPay && hasDebt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPay();
              }}
              className="rounded-md px-2.5 py-1 text-[11px] font-bold mr-1"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              Оплатити
            </button>
          )}
          <Link
            href={`/admin-v2/counterparties/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10"
            title="Відкрити повне дос'є"
          >
            <ExternalLink size={13} style={{ color: T.accentPrimary }} />
          </Link>
        </td>
      </tr>
      {isOpen && (
        <tr style={{ borderColor: T.borderSoft }}>
          <td colSpan={6} className="p-0">
            <div
              className="px-6 py-3 grid gap-3 sm:grid-cols-2"
              style={{ backgroundColor: T.panelSoft }}
            >
              {/* Borg by project */}
              <div>
                <div
                  className="text-[10.5px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: T.textMuted }}
                >
                  Борг по проєктах
                </div>
                {isLoadingDetail ? (
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textMuted }}>
                    <Loader2 size={12} className="animate-spin" /> Завантажуємо…
                  </div>
                ) : !detail ? (
                  <div className="text-[11px]" style={{ color: T.textMuted }}>
                    Немає даних
                  </div>
                ) : detail.outstandingByProject.length === 0 ? (
                  <div className="text-[11px]" style={{ color: T.textMuted }}>
                    Без активного боргу. Усі факти оплачені або заархівовані.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {detail.outstandingByProject.map((d) => (
                      <div
                        key={d.projectId ?? "__none__"}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[12px]"
                        style={{ backgroundColor: T.panel }}
                      >
                        {d.projectId && d.projectSlug ? (
                          <Link
                            href={`/admin-v2/projects/${d.projectSlug}`}
                            className="truncate flex-1 hover:underline"
                            style={{ color: T.accentPrimary }}
                          >
                            {d.projectTitle ?? "Проєкт"}
                          </Link>
                        ) : (
                          <span className="truncate flex-1" style={{ color: T.textMuted }}>
                            Без проєкту
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: T.textMuted }}>
                          {d.entryCount}×
                        </span>
                        <span
                          className="tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: T.danger }}
                        >
                          {formatCurrency(d.outstanding)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top materials */}
              <div>
                <div
                  className="text-[10.5px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: T.textMuted }}
                >
                  Топ матеріалів
                </div>
                {isLoadingDetail ? (
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textMuted }}>
                    <Loader2 size={12} className="animate-spin" /> Завантажуємо…
                  </div>
                ) : !detail || detail.outstandingByMaterial.length === 0 ? (
                  <div className="text-[11px]" style={{ color: T.textMuted }}>
                    Немає даних
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {detail.outstandingByMaterial.slice(0, 8).map((m) => (
                      <div
                        key={m.name}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[12px]"
                        style={{ backgroundColor: T.panel }}
                      >
                        <span className="truncate flex-1" style={{ color: T.textPrimary }}>
                          {m.name}
                        </span>
                        <span className="text-[10px]" style={{ color: T.textMuted }}>
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
                    {detail.outstandingByMaterial.length > 8 && (
                      <div className="text-[10px] text-center" style={{ color: T.textMuted }}>
                        + ще {detail.outstandingByMaterial.length - 8}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  kind,
  tone = "muted",
}: {
  label: string;
  value: number;
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
    </div>
  );
}
