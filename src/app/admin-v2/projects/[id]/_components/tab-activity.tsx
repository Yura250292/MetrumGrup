"use client";

import {
  Activity,
  CheckCircle2,
  Camera,
  FileText,
  MessageSquare,
  Loader2,
  Users,
  ListTree,
} from "lucide-react";
import { useFeed, type FeedKind } from "@/hooks/useFeed";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const KIND_META: Record<
  FeedKind,
  { icon: typeof Activity; label: string; bg: string; fg: string }
> = {
  completion_act: {
    icon: CheckCircle2,
    label: "Виконано",
    bg: T.successSoft,
    fg: T.success,
  },
  photo_report: {
    icon: Camera,
    label: "Фото-звіт",
    bg: T.accentPrimarySoft,
    fg: T.accentPrimary,
  },
  estimate_approved: {
    icon: FileText,
    label: "Кошторис",
    bg: T.warningSoft,
    fg: T.warning,
  },
  comment: {
    icon: MessageSquare,
    label: "Коментар",
    bg: T.panelElevated,
    fg: T.textSecondary,
  },
  chat_message: {
    icon: MessageSquare,
    label: "Чат",
    bg: T.panelElevated,
    fg: T.textSecondary,
  },
  member_change: {
    icon: Users,
    label: "Команда",
    bg: T.accentPrimarySoft,
    fg: T.accentPrimary,
  },
  stage_change: {
    icon: ListTree,
    label: "Етап",
    bg: T.warningSoft,
    fg: T.warning,
  },
};

function timeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "щойно";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.round(hours / 24);
  return `${days} дн. тому`;
}

export function TabActivity({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useFeed(50);

  const items = (data?.items ?? []).filter((i) => i.project?.id === projectId);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
        style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl px-4 py-3 text-xs"
        style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
      >
        Помилка: {(error as Error).message}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Activity size={32} style={{ color: T.accentPrimary }} />
        <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
          Активності по проєкту немає
        </span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          Тут зʼявлятимуться нові коментарі, фото, кошториси та зміни
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const meta = KIND_META[item.kind];
        const Icon = meta.icon;
        return (
          <div
            key={item.id}
            className="flex items-start gap-3.5 rounded-2xl p-4"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: meta.bg }}
            >
              <Icon size={18} style={{ color: meta.fg }} />
            </div>
            <div className="flex flex-1 flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: meta.bg, color: meta.fg }}
                >
                  {meta.label}
                </span>
                {item.actor?.name && (
                  <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>
                    {item.actor.name}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  · {timeAgo(item.createdAt)}
                </span>
              </div>
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                {item.title}
              </span>
              {item.subtitle && (
                <span className="text-[12px]" style={{ color: T.textSecondary }}>
                  {item.subtitle}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
