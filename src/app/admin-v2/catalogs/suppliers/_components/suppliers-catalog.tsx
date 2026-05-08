"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Search } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type PriceHistoryPoint = {
  id: string;
  price: string | number;
  unit: string | null;
  observedAt: string;
};

type Material = {
  id: string;
  name: string;
  nameKey: string;
  unit: string | null;
  lastPrice: string | number | null;
  lastSeenAt: string | null;
  counterparty: { id: string; name: string };
  priceHistory: PriceHistoryPoint[];
};

type GroupBy = "supplier" | "material";

export function SuppliersCatalog() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("supplier");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("withHistory", "true");
      params.set("take", "1000");
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/financing/supplier-materials?${params}`, {
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

  // Debounce пошуку.
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const grouped = useMemo(() => {
    if (groupBy === "supplier") {
      const m = new Map<string, { name: string; counterpartyId: string; rows: Material[] }>();
      for (const it of items) {
        const key = it.counterparty.id;
        const cur = m.get(key) ?? {
          name: it.counterparty.name,
          counterpartyId: key,
          rows: [],
        };
        cur.rows.push(it);
        m.set(key, cur);
      }
      // Сортуємо групи за кількістю матеріалів desc.
      return [...m.values()].sort((a, b) => b.rows.length - a.rows.length);
    } else {
      const m = new Map<string, { name: string; counterpartyId: string; rows: Material[] }>();
      for (const it of items) {
        const cur = m.get(it.nameKey) ?? {
          name: it.name,
          counterpartyId: "",
          rows: [],
        };
        cur.rows.push(it);
        m.set(it.nameKey, cur);
      }
      // Сортуємо за кількістю постачальників desc — найпопулярніші матеріали зверху.
      return [...m.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
  }, [items, groupBy]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
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
            placeholder="Пошук — назва матеріалу (цемент, плитка, фарба…)"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["supplier", "material"] as const).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGroupBy(g);
                setExpanded(new Set());
              }}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: groupBy === g ? T.accentPrimary : T.panelSoft,
                color: groupBy === g ? "#fff" : T.textSecondary,
                border: `1px solid ${groupBy === g ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {g === "supplier" ? "За постачальником" : "За матеріалом"}
            </button>
          ))}
        </div>
      </div>

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
      ) : grouped.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center text-sm"
          style={{
            backgroundColor: T.panel,
            border: `1px dashed ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          {search.trim()
            ? "Нічого не знайдено за пошуком."
            : "Довідник матеріалів порожній. Він заповнюється автоматично — коли менеджер approve foreman-звіт із MATERIAL items і прив'язаним постачальником, ціна потрапляє сюди."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map((g, idx) => {
            const key =
              groupBy === "supplier"
                ? `cp:${g.counterpartyId}`
                : `mat:${g.rows[0]?.nameKey ?? idx}`;
            const isOpen = expanded.has(key);
            const totalRows = g.rows.length;
            return (
              <div
                key={key}
                className="rounded-2xl"
                style={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <button
                  onClick={() => toggle(key)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown size={14} style={{ color: T.textMuted }} />
                  ) : (
                    <ChevronRight size={14} style={{ color: T.textMuted }} />
                  )}
                  <span
                    className="font-bold flex-1 truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {g.name}
                  </span>
                  <span
                    className="text-[11px] rounded px-1.5 py-0.5 tabular-nums"
                    style={{
                      backgroundColor: T.panelSoft,
                      color: T.textMuted,
                    }}
                  >
                    {groupBy === "supplier"
                      ? `${totalRows} матеріал${suffix(totalRows)}`
                      : `${totalRows} постач.`}
                  </span>
                  {groupBy === "supplier" && g.counterpartyId && (
                    <Link
                      href={`/admin-v2/counterparties/${g.counterpartyId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md p-1.5 hover:bg-black/10"
                      title="Дос'є постачальника"
                    >
                      <ExternalLink size={13} style={{ color: T.accentPrimary }} />
                    </Link>
                  )}
                </button>
                {isOpen && (
                  <div className="border-t" style={{ borderColor: T.borderSoft }}>
                    <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
                      <thead>
                        <tr
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
                        >
                          <th className="px-4 py-2 text-left">
                            {groupBy === "supplier" ? "Матеріал" : "Постачальник"}
                          </th>
                          <th className="px-3 py-2 text-left">Од.</th>
                          <th className="px-3 py-2 text-right">Ціна</th>
                          <th className="px-3 py-2 text-right">Тренд</th>
                          <th className="px-3 py-2 text-right">Обновлено</th>
                          <th className="px-3 py-2 text-right">Спостережень</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((m) => {
                          const lastPrice =
                            m.lastPrice !== null ? Number(m.lastPrice) : null;
                          const prev =
                            m.priceHistory.length > 1
                              ? Number(m.priceHistory[1].price)
                              : null;
                          const delta =
                            lastPrice !== null && prev !== null && prev > 0
                              ? (lastPrice - prev) / prev
                              : null;
                          return (
                            <tr
                              key={m.id}
                              className="border-t"
                              style={{ borderColor: T.borderSoft }}
                            >
                              <td className="px-4 py-2">
                                {groupBy === "supplier" ? (
                                  <span className="font-medium">{m.name}</span>
                                ) : (
                                  <Link
                                    href={`/admin-v2/counterparties/${m.counterparty.id}`}
                                    className="font-medium hover:underline"
                                    style={{ color: T.accentPrimary }}
                                  >
                                    {m.counterparty.name}
                                  </Link>
                                )}
                              </td>
                              <td
                                className="px-3 py-2 text-[12px]"
                                style={{ color: T.textSecondary }}
                              >
                                {m.unit ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                {lastPrice !== null
                                  ? formatCurrency(lastPrice)
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {delta !== null && Math.abs(delta) >= 0.01 ? (
                                  <span
                                    className="text-[11px] font-bold tabular-nums"
                                    style={{
                                      color: delta > 0 ? T.danger : T.success,
                                    }}
                                    title={
                                      prev !== null
                                        ? `Раніше: ${formatCurrency(prev)}`
                                        : undefined
                                    }
                                  >
                                    {delta > 0 ? "▲" : "▼"}{" "}
                                    {(Math.abs(delta) * 100).toFixed(0)}%
                                  </span>
                                ) : (
                                  <span style={{ color: T.textMuted }}>—</span>
                                )}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[11px]"
                                style={{ color: T.textMuted }}
                              >
                                {m.lastSeenAt
                                  ? format(new Date(m.lastSeenAt), "d MMM yy", {
                                      locale: uk,
                                    })
                                  : "—"}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[11px] tabular-nums"
                                style={{ color: T.textMuted }}
                              >
                                {m.priceHistory.length}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function suffix(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "и";
  return "ів";
}
