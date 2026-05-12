"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCcw, Download, Presentation } from "lucide-react";

type CountSum = { count: number; sum: number };
type ByGroup<K extends string> = (CountSum & { [P in K]: string | null })[];

type AuditResponse = {
  capturedAt: string;
  totals: { totalEntries: number; nullFinanceNature: number };
  bySource: ByGroup<"source">;
  byKindType: ByGroup<"kind"> & ByGroup<"type">;
  byStatus: ByGroup<"status">;
  bySourceKindStatus: Array<{
    source: string | null;
    kind: string | null;
    status: string | null;
    count: number;
    sum: number;
  }>;
  factBySource: ByGroup<"source">;
  byFinanceNature: Array<{
    financeNature: string | null;
    count: number;
    sum: number;
  }>;
  bySourceFinanceNature: Array<{
    source: string | null;
    financeNature: string | null;
    count: number;
    sum: number;
  }>;
  planFromKb2LikeCount: number;
  supplierDebt: {
    unpaidFactCount: number;
    debtRaw: number;
    allocationsTotal: number;
    debtAfterAllocations: number;
    note: string;
  };
  projectsWithBothPlanSources: number;
};

const fmtNumber = (n: number) =>
  n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });

export default function MigrationAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/financing/migration-audit", {
        cache: "no-store",
      });
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      const json = (await r.json()) as AuditResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function downloadJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-baseline-${data.capturedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/admin-v2/financing"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="size-4" />
              До Фінансування
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              Migration audit (Safe Finance Migration · Phase 0)
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Інвентаризація фінансового ledger перед міграцією семантики
              (BUDGET / COMMITMENT / ACTUAL). Тільки для читання. Збережіть
              JSON-знімок як baseline для подальшого порівняння.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin-v2/financing/migration-plan"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Presentation className="size-4" />
              Пояснення у нашому UI
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Оновити
            </button>
            <button
              onClick={downloadJson}
              disabled={!data}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="size-4" />
              Завантажити baseline JSON
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="mb-6 grid grid-cols-3 gap-3">
              <StatCard
                label="Всього записів"
                value={fmtNumber(data.totals.totalEntries)}
              />
              <StatCard
                label="financeNature IS NULL"
                value={fmtNumber(data.totals.nullFinanceNature)}
                hint="Очікувано: дорівнює всього записів — backfill ще не запускався."
              />
              <StatCard
                label="Знімок зроблено"
                value={new Date(data.capturedAt).toLocaleString("uk-UA")}
              />
            </section>

            <GroupTable
              title="За source"
              columns={["source", "count", "sum"]}
              rows={data.bySource.map((r) => ({
                source: r.source ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="За kind × type"
              columns={["kind", "type", "count", "sum"]}
              rows={data.byKindType.map((r) => ({
                kind: r.kind ?? "—",
                type: (r as unknown as { type: string }).type ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="За status"
              columns={["status", "count", "sum"]}
              rows={data.byStatus.map((r) => ({
                status: r.status ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Семантичний дрейф: FACT за source"
              hint="STAGE_AUTO FACT тут не є cash actual — це progress."
              columns={["source", "count", "sum"]}
              rows={data.factBySource.map((r) => ({
                source: r.source ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="За financeNature (Phase 2/5 progress)"
              hint="Зростання не-null рядків після деплою Phase 5 writers = живий end-to-end."
              columns={["financeNature", "count", "sum"]}
              rows={data.byFinanceNature.map((r) => ({
                financeNature: r.financeNature ?? "—(null)",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="financeNature за source (тільки класифіковані)"
              columns={["source", "financeNature", "count", "sum"]}
              rows={data.bySourceFinanceNature.map((r) => ({
                source: r.source ?? "—",
                financeNature: r.financeNature ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Топ source × kind × status (50)"
              columns={["source", "kind", "status", "count", "sum"]}
              rows={data.bySourceKindStatus.map((r) => ({
                source: r.source ?? "—",
                kind: r.kind ?? "—",
                status: r.status ?? "—",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-base font-semibold text-slate-900">
                Supplier debt baseline
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-slate-500">unpaid FACT EXPENSE count</dt>
                <dd>{fmtNumber(data.supplierDebt.unpaidFactCount)}</dd>
                <dt className="text-slate-500">debtRaw (owner KPI logic)</dt>
                <dd>{fmtNumber(data.supplierDebt.debtRaw)}</dd>
                <dt className="text-slate-500">SUM allocations</dt>
                <dd>{fmtNumber(data.supplierDebt.allocationsTotal)}</dd>
                <dt className="text-slate-500">
                  debtAfterAllocations (грубо)
                </dt>
                <dd>{fmtNumber(data.supplierDebt.debtAfterAllocations)}</dd>
              </dl>
              <p className="mt-2 text-xs text-slate-500">
                {data.supplierDebt.note}
              </p>
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-base font-semibold text-slate-900">
                Інші маркери дрейфу
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-slate-500">
                  PLAN INCOME MANUAL · category=client_advance (proxy для KB2)
                </dt>
                <dd>{fmtNumber(data.planFromKb2LikeCount)}</dd>
                <dt className="text-slate-500">
                  Проекти з обома планами (ESTIMATE_AUTO + STAGE_AUTO)
                </dt>
                <dd>{fmtNumber(data.projectsWithBothPlanSources)}</dd>
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function GroupTable({
  title,
  columns,
  rows,
  hint,
}: {
  title: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  hint?: string;
}) {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-3 text-center text-slate-400"
                >
                  немає даних
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                {columns.map((c) => (
                  <td key={c} className="px-4 py-2">
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
