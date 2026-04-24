"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Mic, FileText } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatRelativeTime } from "@/lib/utils";
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

  return (
    <WidgetShell
      icon={<Calendar size={14} />}
      title="Наради"
      action={{ href: "/admin-v2/meetings", label: "Усі" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={
                  m.project
                    ? `/admin-v2/projects/${m.projectId}/meetings/${m.id}`
                    : `/admin-v2/meetings/${m.id}`
                }
                className="flex min-h-[44px] items-start gap-2.5 rounded-lg px-2 py-2 transition hover:brightness-[0.97] touch-manipulation"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: T.accentSecondary + "18",
                    color: T.accentSecondary,
                  }}
                >
                  {m.summary ? <FileText size={13} /> : <Mic size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12.5px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {m.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[10.5px]">
                    <span style={{ color: T.textMuted }}>
                      {formatRelativeTime(new Date(m.recordedAt))}
                    </span>
                    {m.audioDurationMs && (
                      <span style={{ color: T.textMuted }}>
                        · {formatDuration(m.audioDurationMs)}
                      </span>
                    )}
                    {m.project && (
                      <span className="truncate" style={{ color: T.textMuted }}>
                        · {m.project.title}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
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
          className="h-11 rounded-lg"
          style={{ backgroundColor: T.panelElevated, opacity: 0.5 }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-6 text-center">
      <Calendar size={20} style={{ color: T.textMuted }} />
      <span className="mt-1 text-[12px]" style={{ color: T.textMuted }}>
        Немає останніх нарад
      </span>
    </div>
  );
}
