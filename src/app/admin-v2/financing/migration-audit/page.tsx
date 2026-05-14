"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCcw, Download, Presentation, FileUp, X } from "lucide-react";

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

// === Локалізація для аудиту міграції ===
// Ключі (`source`, `kind` тощо) залишаються англійською у JSON-відповіді бекенду —
// вони відповідають полям Prisma. У UI показуємо людські назви.

const HEADER_LABELS: Record<string, string> = {
  source: "Джерело",
  kind: "Тип запису",
  type: "Напрямок",
  status: "Статус",
  count: "Кількість",
  sum: "Сума",
  financeNature: "Фінансова природа",
  key: "Значення",
  before: "Було",
  after: "Стало",
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Вручну",
  ESTIMATE_AUTO: "З кошторису",
  STAGE_AUTO: "З етапу",
  FOREMAN_REPORT: "Звіт виконроба",
  OCR: "OCR-скан",
};

const KIND_LABELS: Record<string, string> = {
  PLAN: "План",
  FACT: "Факт",
};

const TYPE_LABELS: Record<string, string> = {
  INCOME: "Дохід",
  EXPENSE: "Витрата",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Чернетка",
  PENDING: "На погодженні",
  APPROVED: "Затверджено",
  PAID: "Оплачено",
};

const NATURE_LABELS: Record<string, string> = {
  BUDGET_INCOME: "Бюджет: дохід",
  BUDGET_EXPENSE: "Бюджет: витрата",
  COMMITTED_INCOME: "Очікуваний дохід",
  COMMITTED_EXPENSE: "Борг постачальнику",
  ACTUAL_INCOME: "Реальне надходження",
  ACTUAL_EXPENSE: "Реальна оплата",
};

/** Перекладає enum-значення в людську назву, fallback на оригінал. */
function tr(map: Record<string, string>, v: string | null | undefined): string {
  if (v == null) return "—";
  return map[v] ?? v;
}

export default function MigrationAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [baseline, setBaseline] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function uploadBaseline(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AuditResponse;
        setBaseline(parsed);
      } catch {
        setError("Файл baseline не парситься як JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // дозволити повторне завантаження того самого файлу
  }

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
              Аудит фінансової міграції (Phase 0)
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Інвентаризація фінансового ledger перед міграцією семантики
              (BUDGET / COMMITMENT / ACTUAL). Тільки для читання. Збережіть
              JSON-знімок як базу (baseline) для подальшого порівняння.
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
              Завантажити знімок JSON
            </button>
            <label
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Завантажити попередній знімок JSON для порівняння"
            >
              <FileUp className="size-4" />
              {baseline ? "Замінити базовий знімок" : "Порівняти з базою"}
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={uploadBaseline}
              />
            </label>
            {baseline && (
              <button
                onClick={() => setBaseline(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                title="Прибрати базовий знімок"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {baseline && data && (
          <DiffSection current={data} baseline={baseline} />
        )}

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
                label="Без фінансової природи"
                value={fmtNumber(data.totals.nullFinanceNature)}
                hint="Очікувано: дорівнює всього записів — повторне заповнення (backfill) ще не запускалось."
              />
              <StatCard
                label="Знімок зроблено"
                value={new Date(data.capturedAt).toLocaleString("uk-UA")}
              />
            </section>

            <GroupTable
              title="Розподіл за джерелом"
              columns={["source", "count", "sum"]}
              rows={data.bySource.map((r) => ({
                source: tr(SOURCE_LABELS, r.source),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Розподіл за типом × напрямком"
              columns={["kind", "type", "count", "sum"]}
              rows={data.byKindType.map((r) => ({
                kind: tr(KIND_LABELS, r.kind),
                type: tr(TYPE_LABELS, (r as unknown as { type: string }).type),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Розподіл за статусом"
              columns={["status", "count", "sum"]}
              rows={data.byStatus.map((r) => ({
                status: tr(STATUS_LABELS, r.status),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Семантичний дрейф: фактичні за джерелом"
              hint="Записи з джерела «З етапу» тут не є реальною оплатою — це прогрес виконання."
              columns={["source", "count", "sum"]}
              rows={data.factBySource.map((r) => ({
                source: tr(SOURCE_LABELS, r.source),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Розподіл за фінансовою природою"
              hint="Зростання класифікованих рядків після деплою писачів Phase 5 означає живий end-to-end-потік."
              columns={["financeNature", "count", "sum"]}
              rows={data.byFinanceNature.map((r) => ({
                financeNature: r.financeNature
                  ? tr(NATURE_LABELS, r.financeNature)
                  : "—(без класифікації)",
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Фінансова природа за джерелом (тільки класифіковані)"
              columns={["source", "financeNature", "count", "sum"]}
              rows={data.bySourceFinanceNature.map((r) => ({
                source: tr(SOURCE_LABELS, r.source),
                financeNature: tr(NATURE_LABELS, r.financeNature),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <GroupTable
              title="Топ комбінацій: джерело × тип × статус (50)"
              columns={["source", "kind", "status", "count", "sum"]}
              rows={data.bySourceKindStatus.map((r) => ({
                source: tr(SOURCE_LABELS, r.source),
                kind: tr(KIND_LABELS, r.kind),
                status: tr(STATUS_LABELS, r.status),
                count: fmtNumber(r.count),
                sum: fmtNumber(r.sum),
              }))}
            />

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-base font-semibold text-slate-900">
                Базова інвентаризація боргу постачальникам
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-slate-500">Кількість неоплачених FACT EXPENSE</dt>
                <dd>{fmtNumber(data.supplierDebt.unpaidFactCount)}</dd>
                <dt className="text-slate-500">Сирий борг (debtRaw, логіка KPI власника)</dt>
                <dd>{fmtNumber(data.supplierDebt.debtRaw)}</dd>
                <dt className="text-slate-500">Сума allocations</dt>
                <dd>{fmtNumber(data.supplierDebt.allocationsTotal)}</dd>
                <dt className="text-slate-500">
                  Борг після allocations (грубо)
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
                  Планові аванси від клієнтів (категорія «client_advance»)
                </dt>
                <dd>{fmtNumber(data.planFromKb2LikeCount)}</dd>
                <dt className="text-slate-500">
                  Проєкти з двома планами (з кошторису + з етапу)
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

function DiffSection({
  current,
  baseline,
}: {
  current: AuditResponse;
  baseline: AuditResponse;
}) {
  const deltaNature = diffByKey(
    baseline.byFinanceNature,
    current.byFinanceNature,
    (r) => (r.financeNature ? tr(NATURE_LABELS, r.financeNature) : "—(без класифікації)"),
  );
  const deltaSource = diffByKey(
    baseline.bySource,
    current.bySource,
    (r) => tr(SOURCE_LABELS, r.source),
  );

  return (
    <section className="mb-6 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Порівняння зі знімком
        </h3>
        <span className="text-xs text-slate-600">
          знімок: {new Date(baseline.capturedAt).toLocaleString("uk-UA")} →
          поточний: {new Date(current.capturedAt).toLocaleString("uk-UA")}
        </span>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <DiffStat
          label="Всього записів"
          before={baseline.totals.totalEntries}
          after={current.totals.totalEntries}
        />
        <DiffStat
          label="financeNature IS NULL"
          before={baseline.totals.nullFinanceNature}
          after={current.totals.nullFinanceNature}
          invert
        />
        <DiffStat
          label="Supplier debt (raw)"
          before={baseline.supplierDebt.debtRaw}
          after={current.supplierDebt.debtRaw}
          invert
        />
        <DiffStat
          label="Supplier debt (after allocations)"
          before={baseline.supplierDebt.debtAfterAllocations}
          after={current.supplierDebt.debtAfterAllocations}
          invert
        />
      </div>

      <DiffTable title="Розподіл за financeNature" rows={deltaNature} />
      <DiffTable title="Розподіл за джерелом (source)" rows={deltaSource} />
    </section>
  );
}

type DiffRow = {
  key: string;
  before: number;
  after: number;
  delta: number;
};

function diffByKey<T extends { count: number; sum: number }>(
  base: T[],
  cur: T[],
  keyFn: (r: T) => string,
): DiffRow[] {
  const map = new Map<string, { before: number; after: number }>();
  for (const r of base) {
    map.set(keyFn(r), {
      before: r.count,
      after: 0,
    });
  }
  for (const r of cur) {
    const k = keyFn(r);
    const e = map.get(k) ?? { before: 0, after: 0 };
    e.after = r.count;
    map.set(k, e);
  }
  return Array.from(map.entries())
    .map(([key, { before, after }]) => ({
      key,
      before,
      after,
      delta: after - before,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function DiffStat({
  label,
  before,
  after,
  invert,
}: {
  label: string;
  before: number;
  after: number;
  invert?: boolean;
}) {
  const delta = after - before;
  const positive = delta > 0;
  const color =
    delta === 0
      ? "text-slate-500"
      : invert
        ? positive
          ? "text-red-600"
          : "text-emerald-600"
        : positive
          ? "text-emerald-600"
          : "text-red-600";
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-base font-semibold">{fmtNumber(after)}</span>
        <span className="text-xs text-slate-400">← {fmtNumber(before)}</span>
        <span className={`ml-auto text-sm font-semibold ${color}`}>
          {delta > 0 ? "+" : ""}
          {fmtNumber(delta)}
        </span>
      </div>
    </div>
  );
}

function DiffTable({ title, rows }: { title: string; rows: DiffRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </header>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-1.5">{HEADER_LABELS.key}</th>
            <th className="px-3 py-1.5 text-right">{HEADER_LABELS.before}</th>
            <th className="px-3 py-1.5 text-right">{HEADER_LABELS.after}</th>
            <th className="px-3 py-1.5 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-center text-slate-400">
                нема даних
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium">{r.key}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtNumber(r.before)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtNumber(r.after)}
              </td>
              <td
                className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                  r.delta === 0
                    ? "text-slate-400"
                    : r.delta > 0
                      ? "text-emerald-600"
                      : "text-red-600"
                }`}
              >
                {r.delta > 0 ? "+" : ""}
                {fmtNumber(r.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
                  {HEADER_LABELS[c] ?? c}
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
