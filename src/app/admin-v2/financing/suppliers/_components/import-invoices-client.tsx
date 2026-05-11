"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Filter,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type {
  ImportPlan,
  FirmId,
  InvoicePreview,
} from "@/lib/financing/invoice-import/build-plan";

type Step = "upload" | "preview" | "done";

type Override = {
  firmId?: FirmId;
  projectId?: string | null;
  skip?: boolean;
};

type ClusterOverride = {
  displayName?: string;
  type?: "LEGAL" | "FOP" | "INDIVIDUAL";
  skip?: boolean;
};

type CommitResult = {
  created: {
    counterpartiesGroup: number;
    counterpartiesStudio: number;
    invoices: number;
    payments: number;
  };
  skipped: { rowNumber: number; reason: string }[];
  errors: { rowNumber: number; error: string }[];
};

const fmt = (n: number) =>
  n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ImportInvoicesClient() {
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [parsedRows, setParsedRows] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [clusterOverrides, setClusterOverrides] = useState<
    Record<string, ClusterOverride>
  >({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [filter, setFilter] = useState<"all" | "new-cp" | "debts" | "issues">(
    "all",
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    setOverrides({});
    setClusterOverrides({});
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/financing/import-invoices/preview", {
        method: "POST",
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Помилка парсингу файлу");
        return;
      }
      setPlan(data.plan as ImportPlan);
      setParsedRows(data.parsedRows ?? 0);
      setSkippedRows(data.skippedRows ?? 0);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/financing/import-invoices/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, overrides, clusterOverrides }),
      });
      const data = (await r.json()) as CommitResult & { error?: string };
      if (!r.ok) {
        setError(data?.error ?? "Помилка commit-у");
        return;
      }
      setResult(data);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [plan, overrides, clusterOverrides]);

  const filteredInvoices = useMemo(() => {
    if (!plan) return [];
    const newClusters = new Set(
      plan.clusters
        .filter((c) => !c.groupMatch || !c.studioMatch)
        .map((c) => c.normalizedKey),
    );
    switch (filter) {
      case "new-cp":
        return plan.invoices.filter((i) => newClusters.has(i.supplierKey));
      case "debts":
        return plan.invoices.filter((i) => !i.isPaid);
      case "issues":
        return plan.invoices.filter((i) => i.issues.length > 0);
      default:
        return plan.invoices;
    }
  }, [plan, filter]);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          className="flex items-start gap-2 rounded-xl p-3 text-[12px]"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}33`,
          }}
        >
          <AlertTriangle size={14} className="mt-[1px]" />
          <span>{error}</span>
        </div>
      )}

      {step === "upload" && (
        <UploadPanel
          busy={busy}
          onPick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          onFile={handleFile}
        />
      )}

      {step === "preview" && plan && (
        <>
          <SummaryBanner
            plan={plan}
            parsedRows={parsedRows}
            skippedRows={skippedRows}
          />

          <ClustersPanel
            plan={plan}
            clusterOverrides={clusterOverrides}
            setClusterOverrides={setClusterOverrides}
          />

          <FilterBar filter={filter} setFilter={setFilter} plan={plan} />

          <InvoicesTable
            invoices={filteredInvoices}
            plan={plan}
            overrides={overrides}
            setOverrides={setOverrides}
          />

          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setStep("upload");
                setPlan(null);
              }}
              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold"
              style={{
                backgroundColor: T.panel,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              ← Назад до завантаження
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCommit}
              className="rounded-xl px-4 py-2 text-[13px] font-semibold flex items-center gap-2"
              style={{
                backgroundColor: T.accentPrimary,
                color: "#fff",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Зберегти {plan.invoices.length} рахунків
            </button>
          </div>
        </>
      )}

      {step === "done" && result && <DoneBanner result={result} />}
    </div>
  );
}

function UploadPanel(props: {
  busy: boolean;
  onPick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  const { busy, onPick, fileInputRef, onFile } = props;
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        backgroundColor: T.panel,
        border: `1px dashed ${T.borderStrong}`,
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <Upload
        size={36}
        style={{ color: T.accentPrimary, margin: "0 auto 12px" }}
      />
      <p
        className="text-[14px] font-semibold mb-1"
        style={{ color: T.textPrimary }}
      >
        Перетягніть Excel-файл сюди або оберіть вручну
      </p>
      <p className="text-[12px]" style={{ color: T.textMuted }}>
        Формат: 6 колонок (Постачальник, Рахунок, Куди везли, Сума, Дата
        поставки, Дата оплати). Зелені рядки = оплачено, білі = борг.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        className="mt-4 rounded-xl px-4 py-2 text-[13px] font-semibold"
        style={{
          backgroundColor: T.accentPrimary,
          color: "#fff",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Парсинг…" : "Обрати файл"}
      </button>
    </div>
  );
}

function SummaryBanner({
  plan,
  parsedRows,
  skippedRows,
}: {
  plan: ImportPlan;
  parsedRows: number;
  skippedRows: number;
}) {
  const t = plan.totals;
  return (
    <div
      className="rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <Stat
        label="Прочитано рядків"
        value={`${parsedRows}`}
        sub={skippedRows ? `пропущено ${skippedRows} порожніх` : undefined}
      />
      <Stat
        label="Оплачено (зелені)"
        value={`${t.paidCount}`}
        sub={`${fmt(t.paidSum)} ₴`}
        accent={T.success}
      />
      <Stat
        label="Борг (білі)"
        value={`${t.debtCount}`}
        sub={`${fmt(t.debtSum)} ₴`}
        accent={T.warning}
      />
      <Stat
        label="Постачальників"
        value={`${plan.clusters.length}`}
        sub={`${t.newCounterpartiesInGroup} нових Group · ${t.newCounterpartiesInStudio} нових Studio`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase" style={{ color: T.textMuted }}>
        {label}
      </div>
      <div
        className="text-[18px] font-bold"
        style={{ color: accent ?? T.textPrimary }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px]" style={{ color: T.textSecondary }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ClustersPanel({
  plan,
  clusterOverrides,
  setClusterOverrides,
}: {
  plan: ImportPlan;
  clusterOverrides: Record<string, ClusterOverride>;
  setClusterOverrides: React.Dispatch<
    React.SetStateAction<Record<string, ClusterOverride>>
  >;
}) {
  const [expanded, setExpanded] = useState(false);
  const newCount = plan.clusters.filter(
    (c) => !c.groupMatch || !c.studioMatch,
  ).length;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <span
          className="text-[13px] font-semibold"
          style={{ color: T.textPrimary }}
        >
          Постачальники ({plan.clusters.length}, з них {newCount} нових)
        </span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {expanded ? "Згорнути" : "Розгорнути"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 max-h-[400px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: T.textMuted }}>
                <th className="text-left py-1 pr-2">Назва (canonical)</th>
                <th className="text-left py-1 pr-2">Тип</th>
                <th className="text-left py-1 pr-2">Group</th>
                <th className="text-left py-1 pr-2">Studio</th>
                <th className="text-right py-1 pr-2">Рахунків</th>
                <th className="text-right py-1 pr-2">Сума</th>
                <th className="text-left py-1 pr-2">Raw-варіанти</th>
                <th className="text-left py-1">Skip</th>
              </tr>
            </thead>
            <tbody>
              {plan.clusters.map((c) => {
                const co = clusterOverrides[c.normalizedKey] ?? {};
                return (
                  <tr
                    key={c.normalizedKey}
                    style={{ borderTop: `1px solid ${T.borderSoft}` }}
                  >
                    <td className="py-1 pr-2">
                      <input
                        defaultValue={co.displayName ?? c.displayName}
                        onBlur={(e) =>
                          setClusterOverrides((s) => ({
                            ...s,
                            [c.normalizedKey]: {
                              ...s[c.normalizedKey],
                              displayName: e.target.value,
                            },
                          }))
                        }
                        className="w-full bg-transparent outline-none"
                        style={{ color: T.textPrimary }}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={co.type ?? c.inferredType}
                        onChange={(e) =>
                          setClusterOverrides((s) => ({
                            ...s,
                            [c.normalizedKey]: {
                              ...s[c.normalizedKey],
                              type: e.target.value as
                                | "LEGAL"
                                | "FOP"
                                | "INDIVIDUAL",
                            },
                          }))
                        }
                        className="bg-transparent outline-none"
                        style={{ color: T.textSecondary }}
                      >
                        <option value="LEGAL">LEGAL</option>
                        <option value="FOP">FOP</option>
                        <option value="INDIVIDUAL">INDIVIDUAL</option>
                      </select>
                    </td>
                    <td
                      className="py-1 pr-2"
                      style={{
                        color: c.groupMatch ? T.success : T.warning,
                      }}
                    >
                      {c.groupMatch ? "✓ існує" : "+ новий"}
                    </td>
                    <td
                      className="py-1 pr-2"
                      style={{
                        color: c.studioMatch ? T.success : T.warning,
                      }}
                    >
                      {c.studioMatch ? "✓ існує" : "+ новий"}
                    </td>
                    <td className="text-right py-1 pr-2">{c.rowCount}</td>
                    <td className="text-right py-1 pr-2">
                      {fmt(c.totalAmount)}
                    </td>
                    <td
                      className="py-1 pr-2 truncate max-w-[200px]"
                      style={{ color: T.textMuted }}
                      title={c.rawNames.join(" | ")}
                    >
                      {c.rawNames.length > 1
                        ? `${c.rawNames.length} варіантів`
                        : c.rawNames[0]}
                    </td>
                    <td className="py-1">
                      <input
                        type="checkbox"
                        checked={!!co.skip}
                        onChange={(e) =>
                          setClusterOverrides((s) => ({
                            ...s,
                            [c.normalizedKey]: {
                              ...s[c.normalizedKey],
                              skip: e.target.checked,
                            },
                          }))
                        }
                      />
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
}

function FilterBar({
  filter,
  setFilter,
  plan,
}: {
  filter: "all" | "new-cp" | "debts" | "issues";
  setFilter: (f: "all" | "new-cp" | "debts" | "issues") => void;
  plan: ImportPlan;
}) {
  const issuesCount = plan.invoices.filter((i) => i.issues.length).length;
  const newCpCount = plan.invoices.filter((i) => {
    const c = plan.clusters.find((c) => c.normalizedKey === i.supplierKey);
    return c && (!c.groupMatch || !c.studioMatch);
  }).length;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[12px]">
      <Filter size={13} style={{ color: T.textMuted }} />
      <FilterChip
        active={filter === "all"}
        onClick={() => setFilter("all")}
        label={`Усі (${plan.invoices.length})`}
      />
      <FilterChip
        active={filter === "new-cp"}
        onClick={() => setFilter("new-cp")}
        label={`Тільки нові постачальники (${newCpCount})`}
      />
      <FilterChip
        active={filter === "debts"}
        onClick={() => setFilter("debts")}
        label={`Тільки борги (${plan.totals.debtCount})`}
      />
      <FilterChip
        active={filter === "issues"}
        onClick={() => setFilter("issues")}
        label={`З проблемами (${issuesCount})`}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-2.5 py-1 font-semibold transition"
      style={{
        backgroundColor: active ? T.accentPrimary : T.panel,
        color: active ? "#fff" : T.textSecondary,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {label}
    </button>
  );
}

function InvoicesTable({
  invoices,
  plan,
  overrides,
  setOverrides,
}: {
  invoices: InvoicePreview[];
  plan: ImportPlan;
  overrides: Record<string, Override>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, Override>>>;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className="max-h-[480px] overflow-auto"
      >
        <table className="w-full text-[12px]">
          <thead
            className="sticky top-0"
            style={{ backgroundColor: T.panelElevated }}
          >
            <tr style={{ color: T.textMuted }}>
              <th className="text-left py-1.5 px-2">№</th>
              <th className="text-left py-1.5 px-2">Статус</th>
              <th className="text-left py-1.5 px-2">Постачальник</th>
              <th className="text-left py-1.5 px-2">Рахунок</th>
              <th className="text-left py-1.5 px-2">Куди везли</th>
              <th className="text-right py-1.5 px-2">Сума</th>
              <th className="text-left py-1.5 px-2">Дата</th>
              <th className="text-left py-1.5 px-2">Фірма</th>
              <th className="text-left py-1.5 px-2">Проєкт</th>
              <th className="text-left py-1.5 px-2">!</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const o = overrides[String(inv.rowNumber)] ?? {};
              const cluster = plan.clusters.find(
                (c) => c.normalizedKey === inv.supplierKey,
              );
              const firmId = o.firmId ?? inv.firmIdAssigned;
              return (
                <tr
                  key={inv.rowNumber}
                  style={{ borderTop: `1px solid ${T.borderSoft}` }}
                >
                  <td
                    className="py-1 px-2"
                    style={{ color: T.textMuted }}
                  >
                    {inv.rowNumber}
                  </td>
                  <td className="py-1 px-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{
                        backgroundColor: inv.isPaid
                          ? T.successSoft
                          : T.warningSoft,
                        color: inv.isPaid ? T.success : T.warning,
                      }}
                    >
                      {inv.isPaid ? "PAID" : "DEBT"}
                    </span>
                  </td>
                  <td
                    className="py-1 px-2 truncate max-w-[180px]"
                    style={{ color: T.textPrimary }}
                    title={cluster?.displayName ?? inv.supplierRaw}
                  >
                    {cluster?.displayName ?? inv.supplierRaw}
                  </td>
                  <td
                    className="py-1 px-2 truncate max-w-[120px]"
                    style={{ color: T.textSecondary }}
                    title={inv.invoiceNumber ?? ""}
                  >
                    {inv.invoiceNumber ?? "—"}
                  </td>
                  <td
                    className="py-1 px-2 truncate max-w-[220px]"
                    style={{ color: T.textSecondary }}
                    title={inv.destination ?? ""}
                  >
                    {inv.destination ?? "—"}
                  </td>
                  <td
                    className="text-right py-1 px-2"
                    style={{ color: T.textPrimary }}
                  >
                    {inv.amount !== null ? fmt(inv.amount) : "—"}
                  </td>
                  <td
                    className="py-1 px-2"
                    style={{ color: T.textMuted }}
                  >
                    {inv.deliveryDate
                      ? inv.deliveryDate.slice(0, 10)
                      : inv.paymentDate
                        ? inv.paymentDate.slice(0, 10)
                        : "—"}
                  </td>
                  <td className="py-1 px-2">
                    <select
                      value={firmId}
                      onChange={(e) =>
                        setOverrides((s) => ({
                          ...s,
                          [String(inv.rowNumber)]: {
                            ...s[String(inv.rowNumber)],
                            firmId: e.target.value as FirmId,
                          },
                        }))
                      }
                      className="bg-transparent outline-none"
                      style={{ color: T.textSecondary }}
                    >
                      <option value="metrum-group">Group</option>
                      <option value="metrum-studio">Studio</option>
                    </select>
                  </td>
                  <td
                    className="py-1 px-2"
                    style={{
                      color: inv.matchedProjectId
                        ? T.success
                        : T.textMuted,
                    }}
                  >
                    {inv.matchedProjectId
                      ? `матч (${Math.round(inv.matchedProjectConfidence * 100)}%)`
                      : "—"}
                  </td>
                  <td className="py-1 px-2">
                    {inv.issues.length > 0 && (
                      <span
                        title={inv.issues.join(", ")}
                        style={{ color: T.warning }}
                      >
                        <AlertTriangle size={12} />
                      </span>
                    )}
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

function DoneBanner({ result }: { result: CommitResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{
          backgroundColor: T.successSoft,
          border: `1px solid ${T.success}33`,
        }}
      >
        <CheckCircle2 size={20} style={{ color: T.success }} />
        <div>
          <div
            className="text-[14px] font-semibold"
            style={{ color: T.textPrimary }}
          >
            Імпорт завершено
          </div>
          <div
            className="mt-1 text-[12px]"
            style={{ color: T.textSecondary }}
          >
            Створено: {result.created.invoices} рахунків,{" "}
            {result.created.payments} платежів,{" "}
            {result.created.counterpartiesGroup} нових постачальників у Group,{" "}
            {result.created.counterpartiesStudio} у Studio.
            {result.skipped.length > 0 &&
              ` Пропущено: ${result.skipped.length}.`}
            {result.errors.length > 0 &&
              ` Помилок: ${result.errors.length}.`}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12px]">
            <a
              href="/admin-v2/counterparties"
              className="inline-flex items-center gap-1 underline"
              style={{ color: T.accentPrimary }}
            >
              <ExternalLink size={12} /> Постачальники
            </a>
            <a
              href="/admin-v2/financing/suppliers"
              className="inline-flex items-center gap-1 underline"
              style={{ color: T.accentPrimary }}
            >
              <ExternalLink size={12} /> Кредиторська заборгованість
            </a>
          </div>
        </div>
      </div>

      {result.skipped.length > 0 && (
        <details
          className="rounded-2xl p-3 text-[12px]"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <summary
            className="cursor-pointer font-semibold"
            style={{ color: T.textPrimary }}
          >
            Пропущені рядки ({result.skipped.length})
          </summary>
          <ul className="mt-2 space-y-0.5" style={{ color: T.textSecondary }}>
            {result.skipped.map((s, i) => (
              <li key={i}>
                R{s.rowNumber}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.errors.length > 0 && (
        <details
          className="rounded-2xl p-3 text-[12px]"
          style={{
            backgroundColor: T.dangerSoft,
            border: `1px solid ${T.danger}33`,
          }}
        >
          <summary
            className="cursor-pointer font-semibold"
            style={{ color: T.danger }}
          >
            Помилки ({result.errors.length})
          </summary>
          <ul className="mt-2 space-y-0.5" style={{ color: T.textSecondary }}>
            {result.errors.map((e, i) => (
              <li key={i}>
                R{e.rowNumber}: {e.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
