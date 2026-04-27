"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Camera,
  FileText,
  MessageSquare,
  Users,
  LayoutList,
  Rows3,
  ArrowUpRight,
} from "lucide-react";
import { useFeed, type FeedKind, type FeedItem } from "@/hooks/useFeed";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  PageToolbar,
  ViewModeSwitcher,
  usePersistedViewMode,
  SavedViewsMenu,
  useSavedViews,
} from "@/components/shared/page-toolbar";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/states";

type FeedFilter = "all" | FeedKind | "completed";

const FILTERS: { value: FeedFilter; label: string }[] = [
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

// Kinds worth flagging as priority (triggers left-bar accent).
const PRIORITY_KINDS = new Set<FeedKind>(["completion_act", "estimate_approved"]);

const KIND_META: Record<
  FeedKind,
  { icon: typeof Activity; label: string; bg: string; fg: string }
> = {
  completion_act: { icon: CheckCircle2, label: "Виконано", bg: T.successSoft, fg: T.success },
  photo_report: { icon: Camera, label: "Фото-звіт", bg: T.accentPrimarySoft, fg: T.accentPrimary },
  estimate_approved: { icon: FileText, label: "Кошторис", bg: T.warningSoft, fg: T.warning },
  comment: { icon: MessageSquare, label: "Коментар", bg: T.panelElevated, fg: T.textSecondary },
  chat_message: { icon: MessageSquare, label: "Чат", bg: T.panelElevated, fg: T.textSecondary },
  member_change: { icon: Users, label: "Команда", bg: T.accentPrimarySoft, fg: T.accentPrimary },
};

type Density = "comfortable" | "compact";
const DENSITIES: Density[] = ["comfortable", "compact"];

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

type FeedViewState = { filter: FeedFilter; density: Density };

export default function AdminV2FeedPage() {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [density, setDensity] = usePersistedViewMode<Density>("feed", DENSITIES, "comfortable");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const { views, save: saveView, remove: removeView } = useSavedViews<FeedViewState>("feed");
  const { data, isLoading, error, refetch } = useFeed(30);

  const items = (data?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "completed") return COMPLETED_KINDS.has(item.kind);
    return item.kind === filter;
  });

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        title="Стрічка"
        subtitle="Усе, що відбувається в компанії — в одному місці"
        sticky
        viewMode={
          <ViewModeSwitcher<Density>
            value={density}
            onChange={(v) => {
              setDensity(v);
              setActiveViewId(null);
            }}
            ariaLabel="Щільність стрічки"
            options={[
              { value: "comfortable", label: "Комфорт", icon: LayoutList },
              { value: "compact", label: "Компакт", icon: Rows3 },
            ]}
          />
        }
        rightSlot={
          <SavedViewsMenu<FeedViewState>
            views={views}
            activeId={activeViewId}
            onApply={(state, id) => {
              setFilter(state.filter);
              setDensity(state.density);
              setActiveViewId(id);
            }}
            onSave={(name) => {
              const v = saveView(name, { filter, density });
              setActiveViewId(v.id);
            }}
            onDelete={(id) => {
              removeView(id);
              if (activeViewId === id) setActiveViewId(null);
            }}
          />
        }
        filters={FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFilter(f.value);
                setActiveViewId(null);
              }}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimary : T.panelElevated,
                color: active ? "#FFFFFF" : T.textSecondary,
                border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      />

      <section className="flex flex-col gap-2">
        {isLoading ? (
          <LoadingState variant="skeleton-list" rows={6} label="Завантаження стрічки" />
        ) : error ? (
          <ErrorState
            title="Не вдалось завантажити стрічку"
            description={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Activity size={22} />}
            title="Поки що нічого не відбулось"
            description="Коли з'являться події по проєктах — вони з'являться тут."
          />
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className={idx < 24 ? "data-table-row-enter" : undefined}
              style={idx < 24 ? { animationDelay: `${idx * 50}ms` } : undefined}
            >
              <FeedRow item={item} density={density} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function FeedRow({ item, density }: { item: FeedItem; density: Density }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const isCompact = density === "compact";
  const isPriority = PRIORITY_KINDS.has(item.kind);

  const content = (
    <div
      className={`flex items-start gap-3 rounded-xl ${isCompact ? "px-3 py-2" : "p-4"}`}
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: isPriority ? `inset 3px 0 0 ${meta.fg}` : undefined,
      }}
    >
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded-lg ${
          isCompact ? "h-7 w-7" : "h-10 w-10"
        }`}
        style={{ backgroundColor: meta.bg }}
      >
        <Icon size={isCompact ? 14 : 18} style={{ color: meta.fg }} />
      </div>

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
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

        <span
          className={`${isCompact ? "text-[12px]" : "text-[13px]"} font-semibold truncate`}
          style={{ color: T.textPrimary }}
        >
          {item.title}
        </span>

        {!isCompact && item.subtitle && (
          <span className="text-[12px]" style={{ color: T.textSecondary }}>
            {item.subtitle}
          </span>
        )}

        {!isCompact && item.project && (
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            Проєкт: <span style={{ color: T.textSecondary }}>{item.project.title}</span>
          </span>
        )}

        {item.amount != null && (
          <span className={`font-bold ${isCompact ? "text-[11px]" : "text-[12px]"}`} style={{ color: meta.fg }}>
            {formatCurrency(item.amount)}
          </span>
        )}
      </div>

      {!isCompact && item.project && (
        <QuickAction href={`/admin-v2/projects/${item.project.id}`} label="Проєкт" />
      )}
    </div>
  );

  return item.link ? (
    <Link
      href={item.link}
      className="block rounded-xl transition hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-t-bg"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="flex-shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        color: T.textSecondary,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {label}
      <ArrowUpRight size={11} />
    </Link>
  );
}
