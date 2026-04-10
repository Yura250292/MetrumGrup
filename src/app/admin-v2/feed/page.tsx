"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Camera,
  FileText,
  MessageSquare,
  Loader2,
  Users,
} from "lucide-react";
import { useFeed, type FeedKind, type FeedItem } from "@/hooks/useFeed";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const FILTERS: { value: "all" | FeedKind | "completed"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "completed", label: "Виконано" },
  { value: "photo_report", label: "Фото" },
  { value: "estimate_approved", label: "Кошториси" },
  { value: "comment", label: "Коментарі" },
];

const COMPLETED_KINDS = new Set<FeedKind>([
  "completion_act",
  "estimate_approved",
  "photo_report",
]);

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
  if (days < 30) return `${days} дн. тому`;
  const months = Math.round(days / 30);
  return `${months} міс. тому`;
}

export default function AdminV2FeedPage() {
  const [filter, setFilter] = useState<typeof FILTERS[number]["value"]>("all");
  const { data, isLoading, error } = useFeed(30);

  const items = (data?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "completed") return COMPLETED_KINDS.has(item.kind);
    return item.kind === filter;
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          АКТИВНІСТЬ КОМПАНІЇ
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Стрічка
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Усе, що відбувається в компанії — в одному місці
        </p>
      </section>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="rounded-full px-4 py-2 text-xs font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimary : T.panelElevated,
                color: active ? "#FFFFFF" : T.textSecondary,
                border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Feed list */}
      <section className="flex flex-col gap-2">
        {isLoading ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
            style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : error ? (
          <div
            className="rounded-2xl px-4 py-3 text-xs"
            style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
          >
            Помилка: {(error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <Activity size={32} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Поки що нічого не відбулось
            </span>
          </div>
        ) : (
          items.map((item) => <FeedRow key={item.id} item={item} />)
        )}
      </section>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  const content = (
    <div
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
        {item.project && (
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            Проєкт: <span style={{ color: T.textSecondary }}>{item.project.title}</span>
          </span>
        )}
        {item.amount != null && (
          <span className="text-[12px] font-bold" style={{ color: meta.fg }}>
            {formatCurrency(item.amount)}
          </span>
        )}
      </div>
    </div>
  );

  return item.link ? (
    <Link href={item.link} className="block transition hover:brightness-125">
      {content}
    </Link>
  ) : (
    content
  );
}
