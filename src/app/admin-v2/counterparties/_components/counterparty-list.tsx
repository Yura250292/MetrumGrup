"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Counterparty = {
  id: string;
  name: string;
  type: "LEGAL" | "INDIVIDUAL" | "FOP";
  edrpou: string | null;
  iban: string | null;
  vatPayer: boolean;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const TYPE_LABELS: Record<Counterparty["type"], string> = {
  LEGAL: "ТОВ",
  INDIVIDUAL: "Фіз. особа",
  FOP: "ФОП",
};

const TYPE_COLORS: Record<Counterparty["type"], { bg: string; fg: string }> = {
  LEGAL: { bg: T.skySoft, fg: T.sky },
  FOP: { bg: T.amberSoft, fg: T.amber },
  INDIVIDUAL: { bg: T.violetSoft, fg: T.violet },
};

export function CounterpartyList({ currentUserRole }: { currentUserRole: string }) {
  const canCreate = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"].includes(currentUserRole);

  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | Counterparty["type"]>("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("take", "200");
      if (showInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/admin/financing/counterparties?${params}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setItems(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.edrpou ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, search, typeFilter]);

  async function createNew() {
    const name = prompt("Назва контрагента:");
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/financing/counterparties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Помилка");
        return;
      }
      // Navigate to dossier
      window.location.href = `/admin-v2/counterparties/${j.data.id}`;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Building2 size={20} style={{ color: T.textPrimary }} />
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Контрагенти
        </h1>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {filtered.length}
        </span>
        <div className="flex-1" />
        {canCreate && (
          <button
            onClick={createNew}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Новий контрагент
          </button>
        )}
      </div>

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
            placeholder="Пошук — назва / ЄДРПОУ / телефон / email…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["", "LEGAL", "FOP", "INDIVIDUAL"] as const).map((t) => (
            <button
              key={t || "all"}
              onClick={() => setTypeFilter(t)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: typeFilter === t ? T.accentPrimary : T.panelSoft,
                color: typeFilter === t ? "#fff" : T.textSecondary,
                border: `1px solid ${typeFilter === t ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {t === "" ? "Всі" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: T.textSecondary }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Показати деактивованих
        </label>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: T.textMuted }}>
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
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-3 py-3 text-left">Тип</th>
                <th className="px-3 py-3 text-left">ЄДРПОУ</th>
                <th className="px-3 py-3 text-left">Контакти</th>
                <th className="px-3 py-3 text-right">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const tc = TYPE_COLORS[c.type];
                return (
                  <tr
                    key={c.id}
                    className="border-t transition hover:bg-black/5"
                    style={{ borderColor: T.borderSoft, opacity: c.isActive ? 1 : 0.55 }}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin-v2/counterparties/${c.id}`}
                        className="font-medium hover:underline"
                        style={{ color: T.textPrimary }}
                      >
                        {c.name}
                      </Link>
                      {c.vatPayer && (
                        <span
                          className="ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{ backgroundColor: T.violetSoft, color: T.violet }}
                        >
                          ПДВ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: tc.bg, color: tc.fg }}
                      >
                        {TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      {c.edrpou ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: T.textSecondary }}>
                      <div className="flex flex-col gap-0.5">
                        {c.phone && <span>{c.phone}</span>}
                        {c.email && <span>{c.email}</span>}
                        {!c.phone && !c.email && <span style={{ color: T.textMuted }}>—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {c.isActive ? (
                        <CheckCircle2 size={14} style={{ color: T.success }} />
                      ) : (
                        <XCircle size={14} style={{ color: T.textMuted }} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                    {search.trim() || typeFilter
                      ? "Нічого не знайдено за фільтрами."
                      : "Список порожній. Додайте першого контрагента або синхронізуйте з фінансових операцій."}
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
