"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type HealthCounts = {
  orphanProjectBudget: number;
  entriesMissingFirmId: number;
  entriesMissingFirmIdWithProject: number;
  projectsWithDuplicatePlanLayers: number;
  entriesOnTestProjects: number;
};

type HealthResponse = {
  firmId: string | null;
  counts: HealthCounts;
  totalIssues: number;
  healthy: boolean;
};

const COUNTERS: Array<{
  key: keyof HealthCounts;
  label: string;
  hint: string;
  severity: "critical" | "warning" | "info";
}> = [
  {
    key: "orphanProjectBudget",
    label: "Orphan PROJECT_BUDGET",
    hint: "Rollup-записи бюджету без projectId — висять після видалення/перестворення проєкту.",
    severity: "warning",
  },
  {
    key: "entriesMissingFirmIdWithProject",
    label: "Записи з projectId, але без firmId",
    hint: "Найгірший підмножина — порушує scope по фірмі. Має бути 0.",
    severity: "critical",
  },
  {
    key: "entriesMissingFirmId",
    label: "Записи без firmId (всі)",
    hint: "Включає projectless legacy записи. Bulk-fix через repair-endpoint.",
    severity: "warning",
  },
  {
    key: "projectsWithDuplicatePlanLayers",
    label: "Проєкти з обома шарами плану",
    hint: "PROJECT_BUDGET + детальний план одночасно. Summary дедуплікує, але raw-shape сигналізує про дрейф.",
    severity: "info",
  },
  {
    key: "entriesOnTestProjects",
    label: "Записи на тестових проєктах",
    hint: "Має бути 0 після Phase 1. Інакше — є шлях, який обходить guard.",
    severity: "critical",
  },
];

export default function FinanceDiagnosticsPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/finance-diagnostics/health", { cache: "no-store" });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      setData((await r.json()) as HealthResponse);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      className="min-h-screen px-6 py-8"
      style={{ background: T.background, color: T.textPrimary }}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/admin-v2/financing"
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
            style={{ color: T.textSecondary }}
          >
            <ArrowLeft className="h-4 w-4" />
            До фінансування
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: T.borderSoft, color: T.textPrimary }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Оновити
          </button>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-semibold" style={{ color: T.textPrimary }}>
            Health-counters фінансових даних
          </h1>
          <p className="text-sm" style={{ color: T.textSecondary }}>
            Інваріанти модуля «Фінансування ↔ Проєкти» у scope активної фірми. Надає видимість для repair-логіки до того, як її помічає користувач.
          </p>
        </div>

        {err && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl border p-4"
            style={{ borderColor: T.danger + "44", background: T.dangerSoft }}
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: T.danger }} />
            <div>
              <p className="text-sm font-medium" style={{ color: T.textPrimary }}>
                Не вдалося завантажити дані
              </p>
              <p className="text-xs" style={{ color: T.textSecondary }}>{err}</p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: T.textMuted }} />
          </div>
        )}

        {data && (
          <>
            <div
              className="mb-6 flex items-center gap-3 rounded-xl border p-4"
              style={{
                borderColor: data.healthy ? T.success + "44" : T.warning + "44",
                background: data.healthy ? T.successSoft : T.warningSoft,
              }}
            >
              {data.healthy ? (
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" style={{ color: T.success }} />
              ) : (
                <ShieldAlert className="h-6 w-6 flex-shrink-0" style={{ color: T.warning }} />
              )}
              <div>
                <p className="text-sm font-medium" style={{ color: T.textPrimary }}>
                  {data.healthy
                    ? "Усе чисто — інваріанти в нормі"
                    : `Знайдено ${data.totalIssues} проблемних точок`}
                </p>
                <p className="text-xs" style={{ color: T.textSecondary }}>
                  Фірма: {data.firmId ?? "усі"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {COUNTERS.map((c) => {
                const count = data.counts[c.key];
                const isProblem = count > 0;
                const accent =
                  c.severity === "critical"
                    ? T.danger
                    : c.severity === "warning"
                      ? T.warning
                      : T.indigo;
                return (
                  <div
                    key={c.key}
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: isProblem ? accent + "55" : T.borderSoft,
                      background: T.panel,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: T.textPrimary }}>
                          {c.label}
                        </div>
                        <div className="mt-1 text-xs" style={{ color: T.textSecondary }}>
                          {c.hint}
                        </div>
                      </div>
                      <div
                        className="text-2xl font-semibold tabular-nums"
                        style={{ color: isProblem ? accent : T.textMuted }}
                      >
                        {count}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-xs" style={{ color: T.textMuted }}>
              Endpoint: <code>GET /api/admin/finance-diagnostics/health</code> · Per-project repair: <code>/api/admin/projects/[id]/finance-diagnostics</code>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
