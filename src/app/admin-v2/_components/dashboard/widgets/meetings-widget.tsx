"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Mic, FileText, Clock } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { WidgetShell } from "./widget-shell";

type MeetingItem = {
  id: string;
  title: string;
  status: string;
  recordedAt: string;
  audioDurationMs: number | null;
  projectId: string;
  project: { id: string; title: string } | null;
  summary: string | null;
};

const MONTH_SHORT = [
  "СІЧ",
  "ЛЮТ",
  "БЕР",
  "КВІ",
  "ТРА",
  "ЧЕР",
  "ЛИП",
  "СЕР",
  "ВЕР",
  "ЖОВ",
  "ЛИС",
  "ГРУ",
];

export function MeetingsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "meetings", "widget"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me/meetings");
      if (!res.ok) throw new Error("Не вдалося завантажити наради");
      return (await res.json()) as { data: { items: MeetingItem[] } };
    },
    refetchInterval: 5 * 60_000,
  });

  const items = (data?.data?.items ?? []).slice(0, 5);
  const withSummary = items.filter((m) => m.summary).length;

  return (
    <WidgetShell
      icon={<Calendar size={14} />}
      title="Наради"
      subtitle={
        items.length === 0
          ? "Останні 14 днів"
          : withSummary === items.length
            ? `Усі ${items.length} оброблені AI`
            : `${items.length} · ${withSummary} з підсумком`
      }
      accent={T.accentSecondary}
      action={{ href: "/admin-v2/meetings", label: "Усі" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
          {items.map((m) => {
            const d = new Date(m.recordedAt);
            const day = d.getDate();
            const month = MONTH_SHORT[d.getMonth()];
            const hasSummary = !!m.summary;
            return (
              <li key={m.id}>
                <Link
                  href={`/admin-v2/meetings/${m.id}`}
                  className="group/row flex min-h-[56px] items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 touch-manipulation"
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = T.panelElevated;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {/* Date stamp */}
                  <div
                    className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: T.panelElevated,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <span
                      className="text-[8.5px] font-bold leading-none tracking-wider"
                      style={{ color: T.accentSecondary }}
                    >
                      {month}
                    </span>
                    <span
                      className="text-[16px] font-bold leading-none tabular-nums"
                      style={{ color: T.textPrimary }}
                    >
                      {day}
                    </span>
                  </div>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: hasSummary
                            ? T.success + "22"
                            : T.accentSecondary + "22",
                          color: hasSummary ? T.success : T.accentSecondary,
                        }}
                      >
                        {hasSummary ? <FileText size={9} /> : <Mic size={9} />}
                      </span>
                      <span
                        className="block truncate text-[13px] font-semibold leading-tight tracking-[-0.01em]"
                        style={{ color: T.textPrimary }}
                      >
                        {m.title}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[10.5px]">
                      {m.audioDurationMs && (
                        <span
                          className="inline-flex items-center gap-1 font-medium tabular-nums"
                          style={{ color: T.textMuted }}
                        >
                          <Clock size={10} />
                          {formatDuration(m.audioDurationMs)}
                        </span>
                      )}
                      {m.project && (
                        <span
                          className="truncate font-medium"
                          style={{ color: T.textMuted }}
                        >
                          · {m.project.title}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} год ${rest} хв` : `${h} год`;
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-12 animate-pulse rounded-xl"
          style={{
            backgroundColor: T.panelElevated,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: `linear-gradient(135deg, ${T.accentSecondary}14, ${T.accentPrimary}14)`,
        }}
      >
        <Calendar size={18} style={{ color: T.accentSecondary }} />
      </span>
      <span className="text-[12.5px] font-semibold" style={{ color: T.textPrimary }}>
        Розклад вільний
      </span>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        Немає нарад за 14 днів
      </span>
    </div>
  );
}
