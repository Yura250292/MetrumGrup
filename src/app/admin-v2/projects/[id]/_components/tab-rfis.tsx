"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Download, Clock, Paperclip, AlertCircle } from "lucide-react";
import type { RFIPriority, RFIStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import { RFICreateModal } from "./rfi-create-modal";

const STATUS_COLUMNS: { key: RFIStatus; label: string }[] = [
  { key: "OPEN", label: "Відкриті" },
  { key: "IN_PROGRESS", label: "В роботі" },
  { key: "ANSWERED", label: "Відповідь отримана" },
  { key: "CLOSED", label: "Закриті" },
];

const PRIORITY_COLOR: Record<RFIPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-700",
  NORMAL: "bg-sky-100 text-sky-800",
  HIGH: "bg-amber-100 text-amber-900",
  URGENT: "bg-rose-100 text-rose-800",
};

type RFICard = {
  id: string;
  number: string;
  subject: string;
  status: RFIStatus;
  priority: RFIPriority;
  askedAt: string;
  dueAt: string | null;
  impactsSchedule: boolean;
  impactsBudget: boolean;
  askedBy: { id: string; name: string | null; avatar: string | null };
  assignedTo: { id: string; name: string | null; avatar: string | null } | null;
  attachmentCount: number;
  commentCount: number;
};

function dueCountdown(dueAt: string | null, status: RFIStatus): { label: string; tone: "neutral" | "warn" | "danger" } | null {
  if (!dueAt || status === "ANSWERED" || status === "CLOSED" || status === "CANCELLED") return null;
  const diffH = Math.round((new Date(dueAt).getTime() - Date.now()) / (3600 * 1000));
  if (diffH < 0) return { label: `−${-diffH}год`, tone: "danger" };
  if (diffH < 24) return { label: `${diffH}год`, tone: "warn" };
  return { label: `${Math.round(diffH / 24)}дн`, tone: "neutral" };
}

export function TabRfis({ projectId }: { projectId: string }) {
  const drawer = useDrillDown();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [rfis, setRfis] = useState<RFICard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<RFIPriority | "ALL">("ALL");
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/rfis?projectId=${projectId}&limit=500`);
    if (res.ok) {
      const json = (await res.json()) as { rfis: RFICard[] };
      setRfis(json.rfis);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rfis.filter((r) => {
      if (filterPriority !== "ALL" && r.priority !== filterPriority) return false;
      if (filterOverdueOnly) {
        if (!r.dueAt) return false;
        if (r.status !== "OPEN" && r.status !== "IN_PROGRESS") return false;
        if (new Date(r.dueAt).getTime() > Date.now()) return false;
      }
      return true;
    });
  }, [rfis, filterPriority, filterOverdueOnly]);

  const byStatus = useMemo(() => {
    const map: Record<RFIStatus, RFICard[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      ANSWERED: [],
      CLOSED: [],
      CANCELLED: [],
    };
    for (const r of filtered) map[r.status].push(r);
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border" style={{ borderColor: T.borderSoft }}>
            {(["kanban", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-sm capitalize"
                style={{
                  backgroundColor: view === v ? T.accentPrimarySoft : "transparent",
                  color: view === v ? T.accentPrimary : T.textSecondary,
                }}
              >
                {v === "kanban" ? "Канбан" : "Таблиця"}
              </button>
            ))}
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as RFIPriority | "ALL")}
            className="text-sm rounded-lg border px-2 py-1.5"
            style={{ borderColor: T.borderSoft }}
          >
            <option value="ALL">Усі пріоритети</option>
            <option value="URGENT">URGENT</option>
            <option value="HIGH">HIGH</option>
            <option value="NORMAL">NORMAL</option>
            <option value="LOW">LOW</option>
          </select>
          <label className="text-sm inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filterOverdueOnly}
              onChange={(e) => setFilterOverdueOnly(e.target.checked)}
            />
            тільки прострочені
          </label>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/projects/${projectId}/rfis/export.xlsx`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-zinc-50"
            style={{ borderColor: T.borderSoft, color: T.textSecondary }}
          >
            <Download size={14} /> Експорт
          </a>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Plus size={14} /> Новий RFI
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-500 p-6">Завантаження…</div>}

      {!loading && view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key} className="flex flex-col gap-2 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 px-1">
                {col.label} ({byStatus[col.key].length})
              </div>
              <ul className="flex flex-col gap-2">
                {byStatus[col.key].map((r) => (
                  <li key={r.id}>
                    <RFICardItem rfi={r} onOpen={() => drawer.open({ type: "rfi", id: r.id })} />
                  </li>
                ))}
                {byStatus[col.key].length === 0 && (
                  <li className="text-xs text-zinc-400 italic px-1">—</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && view === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">№</th>
                <th className="text-left py-2 pr-3">Тема</th>
                <th className="text-left py-2 pr-3">Статус</th>
                <th className="text-left py-2 pr-3">Пріоритет</th>
                <th className="text-left py-2 pr-3">Виконавець</th>
                <th className="text-left py-2 pr-3">Дедлайн</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cd = dueCountdown(r.dueAt, r.status);
                return (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-zinc-50 cursor-pointer"
                    style={{ borderColor: T.borderSoft }}
                    onClick={() => drawer.open({ type: "rfi", id: r.id })}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{r.number}</td>
                    <td className="py-2 pr-3">{r.subject}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[r.priority]}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{r.assignedTo?.name ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {cd ? (
                        <span
                          className={`text-xs ${
                            cd.tone === "danger"
                              ? "text-rose-700"
                              : cd.tone === "warn"
                                ? "text-amber-700"
                                : "text-zinc-500"
                          }`}
                        >
                          {cd.label}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <RFICreateModal
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RFICardItem({ rfi, onOpen }: { rfi: RFICard; onOpen: () => void }) {
  const cd = dueCountdown(rfi.dueAt, rfi.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border bg-white p-3 hover:shadow-sm transition"
      style={{ borderColor: T.borderSoft }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono text-[11px] text-zinc-500">{rfi.number}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLOR[rfi.priority]}`}>
          {rfi.priority}
        </span>
      </div>
      <div className="text-sm font-medium text-zinc-900 line-clamp-2">{rfi.subject}</div>
      <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
        <span>{rfi.assignedTo?.name ?? "не призначено"}</span>
        <div className="flex items-center gap-2">
          {rfi.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip size={11} /> {rfi.attachmentCount}
            </span>
          )}
          {cd && (
            <span
              className={`inline-flex items-center gap-0.5 ${
                cd.tone === "danger" ? "text-rose-700" : cd.tone === "warn" ? "text-amber-700" : "text-zinc-500"
              }`}
            >
              {cd.tone === "danger" ? <AlertCircle size={11} /> : <Clock size={11} />}
              {cd.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
