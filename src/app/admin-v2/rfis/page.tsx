"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, AlertCircle, MessageCircleQuestion } from "lucide-react";
import type { RFIPriority, RFIStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import { EmptyState } from "@/components/shared/states/EmptyState";

type RFIRow = {
  id: string;
  number: string;
  subject: string;
  status: RFIStatus;
  priority: RFIPriority;
  askedAt: string;
  dueAt: string | null;
  project: { id: string; title: string };
  askedBy: { id: string; name: string | null };
  assignedTo: { id: string; name: string | null } | null;
};

const STATUS_LABEL: Record<RFIStatus, string> = {
  OPEN: "Відкритий",
  IN_PROGRESS: "В роботі",
  ANSWERED: "Відповідь",
  CLOSED: "Закритий",
  CANCELLED: "Скасований",
};

const TAB_DEFS = [
  { id: "assignedOverdue", label: "Мені — прострочені" },
  { id: "assigned", label: "Мені" },
  { id: "asked", label: "Я запитав" },
  { id: "firmOverdue", label: "Усі прострочені (фірма)" },
  { id: "all", label: "Усі" },
] as const;

type TabId = (typeof TAB_DEFS)[number]["id"];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(new Date(d));
}

function dueCountdown(dueAt: string | null, status: RFIStatus): { label: string; tone: "neutral" | "warn" | "danger" } | null {
  if (!dueAt || status === "ANSWERED" || status === "CLOSED" || status === "CANCELLED") return null;
  const diffH = Math.round((new Date(dueAt).getTime() - Date.now()) / (3600 * 1000));
  if (diffH < 0) return { label: `−${-diffH}год`, tone: "danger" };
  if (diffH < 24) return { label: `${diffH}год`, tone: "warn" };
  return { label: `${Math.round(diffH / 24)}дн`, tone: "neutral" };
}

export default function RFIDashboardPage() {
  const drawer = useDrillDown();
  const [tab, setTab] = useState<TabId>("assignedOverdue");
  const [rows, setRows] = useState<RFIRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j) => setMe(j?.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (tab === "assignedOverdue") {
      params.set("assigneeId", me);
      params.set("overdue", "1");
    } else if (tab === "assigned") {
      params.set("assigneeId", me);
    } else if (tab === "firmOverdue") {
      params.set("overdue", "1");
    }
    const res = await fetch(`/api/admin/rfis?${params.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as { rfis: RFIRow[] };
      let filtered = json.rfis;
      if (tab === "asked") filtered = json.rfis.filter((r) => r.askedBy.id === me);
      setRows(filtered);
    }
    setLoading(false);
  }, [tab, me]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">RFI · Реєстр запитів</h1>

      <div className="flex flex-wrap gap-1 mb-4">
        {TAB_DEFS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 text-sm rounded-lg"
            style={{
              backgroundColor: tab === t.id ? T.accentPrimarySoft : "transparent",
              color: tab === t.id ? T.accentPrimary : T.textSecondary,
              border: `1px solid ${tab === t.id ? T.borderAccent : T.borderSoft}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-zinc-500">Завантаження…</div>}

      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="border-b" style={{ borderColor: T.borderSoft }}>
                <th className="text-left py-2 pr-3">№</th>
                <th className="text-left py-2 pr-3">Тема</th>
                <th className="text-left py-2 pr-3">Проєкт</th>
                <th className="text-left py-2 pr-3">Статус</th>
                <th className="text-left py-2 pr-3">Пріоритет</th>
                <th className="text-left py-2 pr-3">Виконавець</th>
                <th className="text-left py-2 pr-3">Дедлайн</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cd = dueCountdown(r.dueAt, r.status);
                return (
                  <tr
                    key={r.id}
                    className="border-t cursor-pointer hover:bg-zinc-50"
                    style={{ borderColor: T.borderSoft }}
                    onClick={() => drawer.open({ type: "rfi", id: r.id })}
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-zinc-500">{r.number}</td>
                    <td className="py-2 pr-3">{r.subject}</td>
                    <td className="py-2 pr-3 text-zinc-600">{r.project.title}</td>
                    <td className="py-2 pr-3">{STATUS_LABEL[r.status]}</td>
                    <td className="py-2 pr-3">{r.priority}</td>
                    <td className="py-2 pr-3">{r.assignedTo?.name ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className="text-xs text-zinc-500">{fmtDate(r.dueAt)}</span>
                      {cd && (
                        <span
                          className={`ml-2 text-xs inline-flex items-center gap-0.5 ${
                            cd.tone === "danger"
                              ? "text-rose-700"
                              : cd.tone === "warn"
                                ? "text-amber-700"
                                : "text-zinc-500"
                          }`}
                        >
                          {cd.tone === "danger" ? <AlertCircle size={11} /> : <Clock size={11} />}
                          {cd.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8">
                    <EmptyState
                      icon={<MessageCircleQuestion size={22} />}
                      title={
                        tab === "assignedOverdue"
                          ? "Прострочених RFI немає"
                          : tab === "assigned"
                            ? "На вас немає активних RFI"
                            : tab === "asked"
                              ? "Ви ще не створювали RFI"
                              : tab === "firmOverdue"
                                ? "Прострочених RFI по фірмі немає"
                                : "RFI ще немає"
                      }
                      description="RFI створюються в контексті проєкту — відкрийте проєкт і натисніть «Новий RFI» у вкладці «RFI»."
                      action={{ label: "Перейти до проєктів", href: "/admin-v2/projects" }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
