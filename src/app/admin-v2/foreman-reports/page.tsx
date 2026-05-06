"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ReportRow = {
  id: string;
  project: { id: string; title: string };
  foreman: { id: string; name: string; email: string };
  status: string;
  occurredAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  itemCount: number;
  attachmentCount: number;
  total: number;
  createdAt: string;
};

const TABS = [
  { value: "PENDING_APPROVAL", label: "На перевірці" },
  { value: "APPROVED", label: "Підтверджені" },
  { value: "REJECTED", label: "Відхилені" },
  { value: "CANCELLED", label: "Скасовані" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  APPROVED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  REJECTED: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  CANCELLED: "bg-zinc-700/40 text-zinc-400 border-zinc-700",
  DRAFT: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ForemanReportsPage() {
  const [tab, setTab] = useState<TabValue>("PENDING_APPROVAL");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/foreman-reports?status=${tab}`);
        if (!r.ok) throw new Error("fetch");
        const d = await r.json();
        if (cancelled) return;
        setReports(d.reports ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("Не вдалось завантажити звіти");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const counts = useMemo(() => {
    const total = reports.reduce((sum, r) => sum + r.total, 0);
    return { count: reports.length, total };
  }, [reports]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Звіти виконробів</h1>
        <p className="text-sm text-zinc-500">
          Перевіряйте та підтверджуйте звіти про витрати з об{"’"}єктів. Підтвердження записує суми у фактичні витрати проекту.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === t.value ? "border-emerald-500 text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-zinc-500">Завантаження…</div>
      ) : error ? (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 px-4 py-3">{error}</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">Немає звітів у цьому стані</div>
      ) : (
        <>
          <div className="text-sm text-zinc-500 mb-3">
            {counts.count} звітів · разом {counts.total.toFixed(2)} грн
          </div>
          <div className="space-y-2">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/admin-v2/foreman-reports/${r.id}`}
                className="block rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 transition p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold uppercase rounded-full px-2.5 py-0.5 border ${STATUS_COLOR[r.status] ?? ""}`}>
                        {r.status}
                      </span>
                      <span className="text-xs text-zinc-500">{formatDate(r.occurredAt)}</span>
                    </div>
                    <div className="font-semibold text-white">{r.project.title}</div>
                    <div className="text-sm text-zinc-400">
                      {r.foreman.name} · {r.itemCount} позицій{r.attachmentCount > 0 ? ` · 📎 ${r.attachmentCount}` : ""}
                    </div>
                    {r.rejectionReason && (
                      <div className="mt-2 text-xs text-rose-300 bg-rose-500/10 rounded px-2 py-1">
                        Причина: {r.rejectionReason}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-400">{r.total.toFixed(2)} грн</div>
                    {r.submittedAt && (
                      <div className="text-xs text-zinc-500">подано {formatDate(r.submittedAt)}</div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
