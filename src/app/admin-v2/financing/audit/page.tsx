"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCcw,
  Clock,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type RecentItem = {
  id: string;
  title: string;
  planSource: "NONE" | "ESTIMATE" | "STAGE";
  lastPublishedAt: string;
  publicationVersion: number;
  lastPublishedBy: string | null;
};

type DirtyItem = {
  id: string;
  title: string;
  lastPublishedAt: string;
  publicationVersion: number;
  lastStageEditAt: string;
};

type AuditResponse = {
  firmId: string | null;
  recent: RecentItem[];
  dirty: DirtyItem[];
  neverProjected: number;
  totalDirty: number;
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("uk-UA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} год тому`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} дн тому`;
  return fmtDate(iso);
}

export default function FinanceAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/finance-diagnostics/projection-status", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as AuditResponse);
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
      <div className="mx-auto max-w-5xl">
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
            Audit projection-стану
          </h1>
          <p className="text-sm" style={{ color: T.textSecondary }}>
            Останні sync-операції derived-шару, проєкти з застарілою проєкцією (stage tree змінено після останнього publish), і ті, які ніколи не materializeʼались.
          </p>
        </div>

        {err && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl border p-4"
            style={{ borderColor: T.danger + "44", background: T.dangerSoft }}
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: T.danger }} />
            <div>
              <p className="text-sm font-medium">Не вдалося завантажити дані</p>
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
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard
                icon={<AlertTriangle className="h-5 w-5" style={{ color: T.warning }} />}
                label="Dirty (draft ≠ published)"
                value={data.totalDirty}
                accent={data.totalDirty > 0 ? T.warning : T.textMuted}
              />
              <SummaryCard
                icon={<GitBranch className="h-5 w-5" style={{ color: T.danger }} />}
                label="Never published (planSource ≠ NONE)"
                value={data.neverProjected}
                accent={data.neverProjected > 0 ? T.danger : T.textMuted}
              />
              <SummaryCard
                icon={<CheckCircle2 className="h-5 w-5" style={{ color: T.success }} />}
                label="Останніх publish-евентів"
                value={data.recent.length}
                accent={T.indigo}
              />
            </div>

            <Section
              title="Dirty projects"
              subtitle="У stage tree є непубліковані зміни (draft ≠ published) — натисни «Опублікувати у фінансування» на сторінці проєкту"
              empty="Усі проєкти опубліковано."
              items={data.dirty}
              renderItem={(d) => (
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin-v2/projects/${d.id}/finances`}
                      className="block truncate text-sm font-medium hover:underline"
                      style={{ color: T.textPrimary }}
                    >
                      {d.title}
                    </Link>
                    <div className="mt-0.5 text-xs" style={{ color: T.textSecondary }}>
                      Stage редаговано {fmtRelative(d.lastStageEditAt)} • last publication {fmtRelative(d.lastPublishedAt)} (v{d.publicationVersion})
                    </div>
                  </div>
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: T.warningSoft, color: T.warning }}
                  >
                    DIRTY
                  </span>
                </div>
              )}
            />

            <Section
              title="Останні publish-евенти"
              subtitle="25 проєктів за lastPublishedAt desc"
              empty="Жодних publish-евентів ще не зафіксовано."
              items={data.recent}
              renderItem={(r) => (
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin-v2/projects/${r.id}/finances`}
                      className="block truncate text-sm font-medium hover:underline"
                      style={{ color: T.textPrimary }}
                    >
                      {r.title}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
                      <Clock className="h-3 w-3" />
                      {fmtRelative(r.lastPublishedAt)}
                      {r.lastPublishedBy && <span>· {r.lastPublishedBy}</span>}
                      <span>· v{r.publicationVersion}</span>
                    </div>
                  </div>
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background:
                        r.planSource === "STAGE"
                          ? T.successSoft
                          : r.planSource === "ESTIMATE"
                            ? T.amberSoft
                            : T.panelSoft,
                      color:
                        r.planSource === "STAGE"
                          ? T.success
                          : r.planSource === "ESTIMATE"
                            ? T.amber
                            : T.textMuted,
                    }}
                  >
                    {r.planSource}
                  </span>
                </div>
              )}
            />

            <p className="mt-6 text-xs" style={{ color: T.textMuted }}>
              Endpoint: <code>GET /api/admin/finance-diagnostics/projection-status</code>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: T.borderSoft, background: T.panel }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function Section<T_>({
  title,
  subtitle,
  items,
  empty,
  renderItem,
}: {
  title: string;
  subtitle: string;
  items: T_[];
  empty: string;
  renderItem: (item: T_) => React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: T.textPrimary }}>
          {title}
        </h2>
        <p className="text-xs" style={{ color: T.textMuted }}>{subtitle}</p>
      </div>
      <div
        className="rounded-xl border"
        style={{ borderColor: T.borderSoft, background: T.panel }}
      >
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: T.textMuted }}>
            {empty}
          </div>
        ) : (
          <div className="divide-y px-4" style={{ borderColor: T.borderSoft } as React.CSSProperties}>
            {items.map((item, i) => (
              <div key={i}>{renderItem(item)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
