"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ComplianceBadge,
  CounterpartyTaxStatusLabel,
} from "./compliance-badge";
import { ExpiryIndicator } from "./expiry-indicator";

interface ComplianceCheck {
  id: string;
  source: string;
  resultSummary: string;
  success: boolean;
  errorMessage: string | null;
  checkedAt: string;
}

interface ComplianceSummary {
  taxStatus: CounterpartyTaxStatusLabel;
  taxStatusCheckedAt: string | null;
  edrpou: string | null;
  licenseNumber: string | null;
  licenseValidUntil: string | null;
}

export function SrmComplianceTab({
  counterpartyId,
  canWrite,
  initial,
}: {
  counterpartyId: string;
  canWrite: boolean;
  initial: ComplianceSummary;
}) {
  const [summary, setSummary] = useState<ComplianceSummary>(initial);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [busy, setBusy] = useState<"edrpou" | "dabi" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);

  async function loadLog() {
    setLoadingLog(true);
    try {
      // Load via counterparty endpoint — для простоти у rev.1 окремий endpoint
      // не робимо, а беремо останні чеки через query (TODO: окремий endpoint
      // якщо потрібен paginated лог; зараз 50 свіжих).
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/compliance-log`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const j = await res.json();
        setChecks(j.checks ?? []);
      } else {
        setChecks([]);
      }
    } finally {
      setLoadingLog(false);
    }
  }

  useEffect(() => {
    void loadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartyId]);

  async function checkEdrpou() {
    setBusy("edrpou");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/check-edrpou`,
        { method: "POST" },
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка перевірки ЄДРПОУ");
        return;
      }
      setSummary((s) => ({
        ...s,
        taxStatus: j.taxStatus ?? s.taxStatus,
        taxStatusCheckedAt: new Date().toISOString(),
      }));
      void loadLog();
    } finally {
      setBusy(null);
    }
  }

  async function checkDabi() {
    setBusy("dabi");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/check-dabi`,
        { method: "POST" },
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка перевірки ДАБІ");
        return;
      }
      setSummary((s) => ({
        ...s,
        licenseValidUntil: j.licenseValidUntil ?? s.licenseValidUntil,
      }));
      void loadLog();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} style={{ color: T.textSecondary }} />
            <span className="text-[12px] uppercase" style={{ color: T.textSecondary }}>
              Податковий статус:
            </span>
            <ComplianceBadge status={summary.taxStatus} />
            {summary.taxStatusCheckedAt && (
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                · перевірено {format(new Date(summary.taxStatusCheckedAt), "d MMM yyyy", { locale: uk })}
              </span>
            )}
          </div>
          {canWrite && summary.edrpou && (
            <button
              onClick={checkEdrpou}
              disabled={busy === "edrpou"}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold"
              style={{
                backgroundColor: T.accentPrimarySoft,
                color: T.accentPrimary,
              }}
            >
              {busy === "edrpou" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Перевірити ЄДРПОУ
            </button>
          )}
        </div>

        {summary.licenseNumber && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] uppercase" style={{ color: T.textSecondary }}>
                Ліцензія ДАБІ {summary.licenseNumber}:
              </span>
              <ExpiryIndicator validUntil={summary.licenseValidUntil} />
            </div>
            {canWrite && (
              <button
                onClick={checkDabi}
                disabled={busy === "dabi"}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  backgroundColor: T.accentPrimarySoft,
                  color: T.accentPrimary,
                }}
              >
                {busy === "dabi" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Перевірити ДАБІ
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 text-[12px]" style={{ color: T.danger }}>
            {error}
          </div>
        )}
      </div>

      <div
        className="rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div className="mb-2 text-[11px] uppercase tracking-wide" style={{ color: T.textSecondary }}>
          Журнал перевірок
        </div>
        {loadingLog ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={12} className="animate-spin" /> Завантаження…
          </div>
        ) : checks.length === 0 ? (
          <div className="text-[12px]" style={{ color: T.textMuted }}>
            Перевірок ще не було. Натисніть кнопку перевірки вище для першого запиту.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {checks.slice(0, 50).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg p-2 text-[12px]"
                style={{ backgroundColor: T.panelSoft }}
              >
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                  style={{
                    backgroundColor: c.success ? T.successSoft : T.dangerSoft,
                    color: c.success ? T.success : T.danger,
                  }}
                >
                  {c.source}
                </span>
                <span style={{ color: T.textPrimary }}>{c.resultSummary}</span>
                <span className="ml-auto text-[10px]" style={{ color: T.textMuted }}>
                  {format(new Date(c.checkedAt), "d MMM yyyy HH:mm", { locale: uk })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
