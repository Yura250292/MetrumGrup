"use client";

import { useCallback, useEffect, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Download } from "lucide-react";

type TimeReport = {
  range: { from: string; to: string };
  totals: {
    minutes: number;
    cost: number;
    billableMinutes: number;
    billableCost: number;
    entries: number;
  };
  byUser: { userId: string; name: string; minutes: number; cost: number }[];
  byTask: { taskId: string; title: string; minutes: number; cost: number }[];
};

type WorkloadReport = {
  range: { from: string; to: string };
  rows: {
    userId: string;
    name: string;
    avatar: string | null;
    assignedOpen: number;
    assignedOverdue: number;
    loggedMinutes: number;
  }[];
};

function formatHours(min: number): string {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}
function formatMoney(v: number): string {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(v);
}

const PERIODS = [
  { id: "7", label: "7 днів" },
  { id: "30", label: "30 днів" },
  { id: "90", label: "90 днів" },
] as const;

export function ReportsClient({
  projectId,
  canViewCost,
}: {
  projectId: string;
  canViewCost: boolean;
}) {
  const [period, setPeriod] = useState("30");
  const [timeData, setTimeData] = useState<TimeReport | null>(null);
  const [workload, setWorkload] = useState<WorkloadReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const days = Number(period);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const qs = `from=${from.toISOString()}&to=${to.toISOString()}`;
    try {
      const [tr, wr] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/reports/time?${qs}`),
        fetch(`/api/admin/projects/${projectId}/reports/workload?${qs}`),
      ]);
      if (tr.ok) {
        const j = await tr.json();
        setTimeData(j.data);
      }
      if (wr.ok) {
        const j = await wr.json();
        setWorkload(j.data);
      }
    } finally {
      setLoading(false);
    }
  }, [period, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {PERIODS.map((p) => {
            const active = period === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textMuted,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <a
          href={`/api/admin/projects/${projectId}/tasks/export?format=xlsx`}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <Download size={13} />
          Задачі в Excel
        </a>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Усього годин"
          value={timeData ? formatHours(timeData.totals.minutes) : "—"}
        />
        <Tile
          label="Білабельних"
          value={timeData ? formatHours(timeData.totals.billableMinutes) : "—"}
        />
        {canViewCost && (
          <>
            <Tile
              label="Вартість"
              value={timeData ? formatMoney(timeData.totals.cost) : "—"}
              accent={T.accentPrimary}
            />
            <Tile
              label="До інвойсу"
              value={timeData ? formatMoney(timeData.totals.billableCost) : "—"}
              accent="#10b981"
            />
          </>
        )}
      </div>

      {/* By user */}
      <Card title="За співробітниками">
        {loading || !timeData ? (
          <Empty />
        ) : timeData.byUser.length === 0 ? (
          <Empty text="Немає записів часу" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {timeData.byUser.map((u) => (
              <li
                key={u.userId}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span style={{ color: T.textPrimary }}>{u.name}</span>
                <div
                  className="flex items-center gap-4 text-[12px]"
                  style={{ color: T.textMuted }}
                >
                  <span style={{ color: T.textPrimary }}>{formatHours(u.minutes)}</span>
                  {canViewCost && <span>{formatMoney(u.cost)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* By task */}
      <Card title="За задачами">
        {loading || !timeData ? (
          <Empty />
        ) : timeData.byTask.length === 0 ? (
          <Empty text="Немає записів часу" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {timeData.byTask.slice(0, 20).map((t) => (
              <li
                key={t.taskId}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span className="truncate flex-1" style={{ color: T.textPrimary }}>
                  {t.title}
                </span>
                <div
                  className="flex items-center gap-4 text-[12px] flex-shrink-0"
                  style={{ color: T.textMuted }}
                >
                  <span style={{ color: T.textPrimary }}>{formatHours(t.minutes)}</span>
                  {canViewCost && <span>{formatMoney(t.cost)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Workload */}
      <Card title="Навантаження команди">
        {!workload ? (
          <Empty />
        ) : workload.rows.length === 0 ? (
          <Empty text="Немає учасників" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {workload.rows.map((r) => (
              <li
                key={r.userId}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full h-7 w-7 text-[10px] font-bold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 text-sm" style={{ color: T.textPrimary }}>
                  {r.name}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  {r.assignedOpen} відкритих
                </span>
                {r.assignedOverdue > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                  >
                    {r.assignedOverdue} прострочено
                  </span>
                )}
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: T.textMuted }}
                >
                  {formatHours(r.loggedMinutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 py-3"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span
        className="text-xl font-bold"
        style={{ color: accent ?? T.textPrimary }}
      >
        {value}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <h3 className="mb-3 text-[13px] font-bold" style={{ color: T.textPrimary }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ text = "Завантаження…" }: { text?: string }) {
  return (
    <p className="text-center text-[12px]" style={{ color: T.textMuted }}>
      {text}
    </p>
  );
}
