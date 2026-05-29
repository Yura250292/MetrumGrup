import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Upload,
  Users,
  Video,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MeetingsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  const sp = await searchParams;
  const statusFilter = sp.status ?? null;

  const where: Record<string, unknown> = firmId ? { firmId } : {};
  if (statusFilter) where.status = statusFilter;

  const [meetings, totalCount, readyCount, processingCount, draftCount] =
    await Promise.all([
      prisma.meeting.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          recordedAt: true,
          createdAt: true,
          audioDurationMs: true,
          summary: true,
          transcribeProvider: true,
          project: { select: { id: true, title: true, slug: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { recordedAt: "desc" },
        take: 50,
      }),
      prisma.meeting.count({ where: firmId ? { firmId } : {} }),
      prisma.meeting.count({
        where: { status: "READY", ...(firmId ? { firmId } : {}) },
      }),
      prisma.meeting.count({
        where: {
          status: { in: ["UPLOADED", "TRANSCRIBING", "TRANSCRIBED", "SUMMARIZING"] },
          ...(firmId ? { firmId } : {}),
        },
      }),
      prisma.meeting.count({
        where: { status: "DRAFT", ...(firmId ? { firmId } : {}) },
      }),
    ]);

  const totalDurationMs = meetings.reduce(
    (s, m) => s + (m.audioDurationMs ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Наради
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {totalCount}
            </span>{" "}
            нарад · {formatDuration(totalDurationMs)} аудіо ·{" "}
            <span className="font-semibold" style={{ color: T.success }}>
              {readyCount}
            </span>{" "}
            з резюме
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.violetSoft, color: T.violet }}
          >
            V2 PREVIEW
          </span>
          <Link
            href="/admin-v2/meetings"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            Стандартна сторінка
            <ArrowUpRight size={12} />
          </Link>
          <Link
            href="/admin-v2/meetings/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
          >
            <Plus size={14} />
            Нова нарада
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        readyCount={readyCount}
        processingCount={processingCount}
        draftCount={draftCount}
        totalDurationMs={totalDurationMs}
      />

      <Toolbar
        active={statusFilter}
        readyCount={readyCount}
        processingCount={processingCount}
        draftCount={draftCount}
        totalCount={totalCount}
      />

      <MeetingList meetings={meetings} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  readyCount,
  processingCount,
  draftCount,
  totalDurationMs,
}: {
  totalCount: number;
  readyCount: number;
  processingCount: number;
  draftCount: number;
  totalDurationMs: number;
}) {
  const cards: Array<{
    icon: typeof Mic;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: Mic,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "ВСЬОГО",
      value: String(totalCount),
      sub: "нарад",
    },
    {
      icon: Sparkles,
      iconBg: T.successSoft,
      iconColor: T.success,
      label: "З AI-РЕЗЮМЕ",
      value: String(readyCount),
      sub:
        totalCount > 0
          ? `${Math.round((readyCount / totalCount) * 100)}% оброблено`
          : "—",
    },
    {
      icon: Loader2,
      iconBg: T.warningSoft,
      iconColor: T.warning,
      label: "В ОБРОБЦІ",
      value: String(processingCount),
      sub:
        processingCount > 0
          ? "транскрипція / резюме"
          : "усі готові",
    },
    {
      icon: FileText,
      iconBg: T.violetSoft,
      iconColor: T.violet,
      label: "ЧЕРНЕТКИ",
      value: String(draftCount),
      sub: "потребують аудіо",
      dark: true,
    },
    {
      icon: Clock,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "АУДІО ЗАГАЛОМ",
      value: formatDurationShort(totalDurationMs),
      sub: "на 50 останніх",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <article
          key={i}
          className="rounded-xl p-3.5"
          style={{
            backgroundColor: c.dark ? "#0F172A" : T.panel,
            border: c.dark ? "none" : `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: c.iconBg }}
            >
              <c.icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[9.5px] font-bold tracking-wider"
                style={{ color: c.dark ? "#94A3B8" : T.textMuted }}
              >
                {c.label}
              </div>
              <div
                className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
                style={{ color: c.dark ? "#FFFFFF" : T.textPrimary }}
              >
                {c.value}
              </div>
              <div
                className="text-[11px] mt-1 truncate"
                style={{ color: c.dark ? "#A78BFA" : T.textMuted }}
              >
                {c.sub}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Toolbar({
  active,
  readyCount,
  processingCount,
  draftCount,
  totalCount,
}: {
  active: string | null;
  readyCount: number;
  processingCount: number;
  draftCount: number;
  totalCount: number;
}) {
  const segments: Array<{
    key: string | null;
    label: string;
    count: number;
    color: string;
  }> = [
    { key: null, label: "Усі", count: totalCount, color: T.textPrimary },
    { key: "READY", label: "Готові", count: readyCount, color: T.success },
    { key: "TRANSCRIBING", label: "Транскрипція", count: processingCount, color: T.warning },
    { key: "DRAFT", label: "Чернетки", count: draftCount, color: T.violet },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => {
          const isActive = active === s.key;
          const href = s.key
            ? `/admin-v2/meetings-v2?status=${s.key}`
            : "/admin-v2/meetings-v2";
          return (
            <Link
              key={i}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? "#0F172A" : T.panel,
                border: isActive ? "none" : `1px solid ${T.borderSoft}`,
                color: isActive ? "#FFFFFF" : T.textSecondary,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              <span className="tabular-nums opacity-70">{s.count}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type MeetingRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  recordedAt: Date;
  createdAt: Date;
  audioDurationMs: number | null;
  summary: string | null;
  transcribeProvider: string | null;
  project: { id: string; title: string; slug: string } | null;
  createdBy: { id: string; name: string | null } | null;
};

function MeetingList({ meetings }: { meetings: MeetingRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <ul className="flex flex-col">
        {meetings.length === 0 && <EmptyState />}
        {meetings.map((m, idx) => (
          <MeetingRow
            key={m.id}
            meeting={m}
            isLast={idx === meetings.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <li className="px-5 py-12 text-center">
      <div
        className="inline-flex h-12 w-12 items-center justify-center rounded-full mb-3"
        style={{ backgroundColor: T.violetSoft }}
      >
        <Mic size={20} style={{ color: T.violet }} />
      </div>
      <h3
        className="text-[15px] font-bold"
        style={{ color: T.textPrimary }}
      >
        Запиши першу нараду
      </h3>
      <p
        className="text-[12px] mt-1 max-w-xs mx-auto"
        style={{ color: T.textSecondary }}
      >
        Завантаж аудіо — AI зробить транскрипт і резюме за 2-3 хвилини
      </p>
      <Link
        href="/admin-v2/meetings/new"
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold mt-3 transition hover:brightness-110"
        style={{ backgroundColor: T.violet, color: "#FFFFFF" }}
      >
        <Upload size={14} />
        Завантажити нараду
      </Link>
    </li>
  );
}

function MeetingRow({
  meeting,
  isLast,
}: {
  meeting: MeetingRow;
  isLast: boolean;
}) {
  const status = STATUS_MAP[meeting.status] ?? STATUS_MAP.DRAFT;
  return (
    <li
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
      }}
    >
      <Link
        href={`/admin-v2/meetings/${meeting.id}`}
        className="grid grid-cols-1 md:grid-cols-[48px_1fr_180px_120px_120px_20px] items-center gap-3 px-5 py-3.5 transition hover:brightness-95"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: status.bg }}
        >
          <status.icon size={16} style={{ color: status.fg }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
            {meeting.summary && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: T.violetSoft, color: T.violet }}
              >
                <Sparkles size={9} />
                AI
              </span>
            )}
          </div>
          <h3
            className="text-[13px] font-semibold truncate"
            style={{ color: T.textPrimary }}
            title={meeting.title}
          >
            {meeting.title}
          </h3>
          {meeting.summary ? (
            <p
              className="text-[11px] mt-0.5 line-clamp-1"
              style={{ color: T.textMuted }}
            >
              {meeting.summary.slice(0, 140)}
              {meeting.summary.length > 140 && "…"}
            </p>
          ) : meeting.description ? (
            <p
              className="text-[11px] mt-0.5 line-clamp-1"
              style={{ color: T.textMuted }}
            >
              {meeting.description}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          {meeting.project ? (
            <>
              <div
                className="text-[10px] font-bold tracking-wider tabular-nums truncate"
                style={{ color: T.accentPrimary }}
              >
                PRJ-{meeting.project.slug.toUpperCase().slice(0, 8)}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: T.textSecondary }}
              >
                {meeting.project.title}
              </div>
            </>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: T.textMuted }}
            >
              <Users size={11} />
              без проєкту
            </span>
          )}
        </div>
        <div>
          <div
            className="text-[12px] font-semibold tabular-nums"
            style={{ color: T.textPrimary }}
          >
            {formatDuration(meeting.audioDurationMs ?? 0)}
          </div>
          {meeting.transcribeProvider && (
            <div
              className="text-[10px] mt-0.5"
              style={{ color: T.textMuted }}
            >
              {meeting.transcribeProvider}
            </div>
          )}
        </div>
        <div>
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: T.textSecondary }}
          >
            {formatRelativeDate(meeting.recordedAt)}
          </div>
          {meeting.createdBy?.name && (
            <div
              className="text-[10px] truncate"
              style={{ color: T.textMuted }}
            >
              {meeting.createdBy.name}
            </div>
          )}
        </div>
        <ChevronRight
          size={14}
          style={{ color: T.textMuted }}
          className="hidden md:block"
        />
      </Link>
    </li>
  );
}

const STATUS_MAP: Record<
  string,
  {
    bg: string;
    fg: string;
    icon: typeof Mic;
    label: string;
  }
> = {
  DRAFT: { bg: T.panelSoft, fg: T.textMuted, icon: FileText, label: "Чернетка" },
  UPLOADED: { bg: T.skySoft, fg: T.sky, icon: Upload, label: "Завантажено" },
  TRANSCRIBING: {
    bg: T.warningSoft,
    fg: T.warning,
    icon: Loader2,
    label: "Транскрипція",
  },
  TRANSCRIBED: { bg: T.skySoft, fg: T.sky, icon: FileText, label: "Транскрипт" },
  SUMMARIZING: {
    bg: T.violetSoft,
    fg: T.violet,
    icon: Sparkles,
    label: "AI резюме…",
  },
  READY: { bg: T.successSoft, fg: T.success, icon: Video, label: "Готово" },
  FAILED: { bg: T.dangerSoft, fg: T.danger, icon: AlertCircle, label: "Помилка" },
};

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDurationShort(ms: number): string {
  if (!ms) return "0м";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}хв`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}год ${m}хв` : `${h}год`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatRelativeDate(d: Date): string {
  const now = Date.now();
  const ts = new Date(d).getTime();
  const diffSec = Math.round((now - ts) / 1000);
  if (diffSec < 60) return "щойно";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} хв тому`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} год тому`;
  const days = Math.round(diffSec / 86400);
  if (days < 7) return `${days} ${plural(days, "день", "дні", "днів")} тому`;
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}
