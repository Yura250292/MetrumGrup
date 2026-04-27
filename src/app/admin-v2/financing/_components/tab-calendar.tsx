"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import type { FinanceEntryDTO } from "./types";

type Granularity = "DAY" | "WEEK" | "MONTH";

type CashflowBucket = {
  key: string;
  from: string;
  to: string;
  plan: { incoming: number; outgoing: number };
  fact: { incoming: number; outgoing: number };
  net: number;
  runningBalance: number;
  hasGap: boolean;
};

type CashflowResponse = {
  granularity: Granularity;
  range: { from: string; to: string };
  openingBalance: number;
  buckets: CashflowBucket[];
  totals: { incoming: number; outgoing: number; net: number };
  gaps: { from: string; to: string; depth: number }[];
};

const GRANULARITY_LABELS: Record<Granularity, string> = {
  DAY: "День",
  WEEK: "Тиждень",
  MONTH: "Місяць",
};

export function TabCalendar({
  // legacy props — kept for compatibility with financing-view but no longer used
  entries: _entries,
  loading: _loading,
  scope,
}: {
  entries: FinanceEntryDTO[];
  loading: boolean;
  scope?: { id: string; title: string };
}) {
  const [granularity, setGranularity] = useState<Granularity>("WEEK");
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("granularity", granularity);
        if (scope) params.set("projectId", scope.id);
        const res = await fetch(`/api/admin/financing/cashflow?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Помилка завантаження");
        }
        const json = (await res.json()) as CashflowResponse;
        if (alive) setData(json);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Помилка");
          setData(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [granularity, scope]);

  const now = new Date();

  const minBalance = useMemo(() => {
    if (!data) return null;
    return Math.min(
      data.openingBalance,
      ...data.buckets.map((b) => b.runningBalance),
    );
  }, [data]);

  if (loading && !data) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо cashflow…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + granularity switch */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays size={14} style={{ color: T.textMuted }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ПЛАТІЖНИЙ КАЛЕНДАР · ПРОГНОЗ
        </span>
        <div className="ml-auto flex gap-1">
          {(["DAY", "WEEK", "MONTH"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: granularity === g ? T.accentPrimary : T.panelSoft,
                color: granularity === g ? "#fff" : T.textSecondary,
                border: `1px solid ${granularity === g ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            border: `1px solid ${T.danger}40`,
            color: T.danger,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KpiTile label="Відкриваюче сальдо" value={data.openingBalance} icon={<Wallet size={12} />} />
            <KpiTile label="Очікуємо" value={data.totals.incoming} tone="good" icon={<TrendingUp size={12} />} />
            <KpiTile label="Виплат" value={data.totals.outgoing} tone="bad" icon={<TrendingDown size={12} />} />
            <KpiTile
              label="Net у періоді"
              value={data.totals.net}
              tone={data.totals.net < 0 ? "bad" : "good"}
            />
            <KpiTile
              label="Мін. баланс"
              value={minBalance ?? 0}
              tone={(minBalance ?? 0) < 0 ? "bad" : "muted"}
              icon={(minBalance ?? 0) < 0 ? <AlertTriangle size={12} /> : undefined}
            />
          </div>

          {/* Cash gap alerts */}
          {data.gaps.length > 0 && (
            <div
              className="flex flex-col gap-2 rounded-2xl p-4"
              style={{
                backgroundColor: T.dangerSoft,
                border: `1px solid ${T.danger}40`,
              }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} style={{ color: T.danger }} />
                <span className="text-[12px] font-bold tracking-wide" style={{ color: T.danger }}>
                  КАСОВИЙ РОЗРИВ — {data.gaps.length} період{data.gaps.length === 1 ? "" : data.gaps.length < 5 ? "и" : "ів"}
                </span>
              </div>
              <ul className="flex flex-col gap-1 text-[12px]" style={{ color: T.textPrimary }}>
                {data.gaps.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span style={{ color: T.textSecondary }}>
                      {format(new Date(g.from), "d MMM", { locale: uk })}
                      {" → "}
                      {format(new Date(g.to), "d MMM", { locale: uk })}
                    </span>
                    <span className="font-semibold" style={{ color: T.danger }}>
                      мін. {formatCurrencyCompact(g.depth)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bucket list */}
          <div
            className="overflow-hidden rounded-2xl"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
          >
            <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
              <thead>
                <tr
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
                >
                  <th className="px-4 py-3 text-left">Період</th>
                  <th className="px-3 py-3 text-right">План +</th>
                  <th className="px-3 py-3 text-right">План −</th>
                  <th className="px-3 py-3 text-right">Факт +</th>
                  <th className="px-3 py-3 text-right">Факт −</th>
                  <th className="px-3 py-3 text-right">Net</th>
                  <th className="px-3 py-3 text-right">Баланс</th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b) => {
                  const start = new Date(b.from);
                  const end = new Date(b.to);
                  const isPast = end < now;
                  const isCurrent = start <= now && now < end;
                  const fmt = granularity === "MONTH"
                    ? format(start, "LLLL yyyy", { locale: uk })
                    : `${format(start, "d MMM", { locale: uk })} – ${format(new Date(end.getTime() - 1), "d MMM", { locale: uk })}`;
                  return (
                    <tr
                      key={b.key}
                      className="border-t"
                      style={{
                        borderColor: T.borderSoft,
                        backgroundColor: isCurrent
                          ? T.accentPrimarySoft
                          : b.hasGap
                          ? T.dangerSoft
                          : "transparent",
                        opacity: isPast && !isCurrent ? 0.7 : 1,
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-[11px]" style={{ color: T.textMuted }}>
                          {b.key}
                        </span>
                        <div style={{ fontWeight: isCurrent ? 700 : 500 }}>{fmt}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.success }}>
                        {b.plan.incoming > 0 ? formatCurrencyCompact(b.plan.incoming) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.warning }}>
                        {b.plan.outgoing > 0 ? formatCurrencyCompact(b.plan.outgoing) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.success }}>
                        {b.fact.incoming > 0 ? formatCurrencyCompact(b.fact.incoming) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: T.warning }}>
                        {b.fact.outgoing > 0 ? formatCurrencyCompact(b.fact.outgoing) : "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums font-semibold"
                        style={{ color: b.net < 0 ? T.danger : b.net > 0 ? T.success : T.textMuted }}
                      >
                        {b.net !== 0 ? formatCurrencyCompact(b.net) : "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: b.hasGap ? T.danger : T.textPrimary }}
                      >
                        {formatCurrencyCompact(b.runningBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMuted }}>
            <span>
              Період: {format(new Date(data.range.from), "d MMM", { locale: uk })} → {format(new Date(data.range.to), "d MMM yyyy", { locale: uk })}
            </span>
            <span>·</span>
            <span>Сальдо стартового періоду: {formatCurrencyCompact(data.openingBalance)}</span>
            {scope && <><span>·</span><span>Проєкт: {scope.title}</span></>}
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "muted";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
      ? T.danger
      : tone === "muted"
      ? T.textSecondary
      : T.textPrimary;
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
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
