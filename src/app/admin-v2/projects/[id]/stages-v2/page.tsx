import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StagesV2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        include: {
          responsibleUser: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  });
  if (!project) notFound();
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    notFound();
  }

  const stages = project.stages.filter((s) => s.kind === "STAGE");
  const completed = stages.filter((s) => s.status === "COMPLETED").length;
  const inProgress = stages.find((s) => s.status === "IN_PROGRESS") ?? null;
  const pending = stages.filter((s) => s.status === "PENDING").length;

  // Project time window
  const projectStart =
    project.startDate ?? stages.find((s) => s.startDate)?.startDate ?? null;
  const projectEnd =
    project.expectedEndDate ??
    stages
      .slice()
      .reverse()
      .find((s) => s.endDate)?.endDate ??
    null;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <div className="flex items-center justify-between">
        <Link
          href={`/admin-v2/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium transition hover:brightness-110"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft size={14} />
          {project.title}
        </Link>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.violetSoft, color: T.violet }}
          >
            V2 PREVIEW
          </span>
          <Link
            href={`/admin-v2/projects/${id}?tab=overview`}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
              color: T.textSecondary,
            }}
          >
            Стандартний перегляд
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Етапи проєкту
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {stages.length}
            </span>{" "}
            етапів ·{" "}
            <span className="font-semibold" style={{ color: T.success }}>
              {completed}
            </span>{" "}
            завершено{" "}
            {inProgress && (
              <>
                ·{" "}
                <span className="font-semibold" style={{ color: T.accentPrimary }}>
                  1 активний
                </span>
              </>
            )}{" "}
            ·{" "}
            <span className="font-semibold" style={{ color: T.textMuted }}>
              {pending}
            </span>{" "}
            запланованих
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition hover:brightness-110"
          style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
        >
          <Plus size={14} />
          Новий етап
        </button>
      </header>

      <GanttStrip
        stages={stages}
        projectStart={projectStart}
        projectEnd={projectEnd}
      />

      {inProgress && <ActiveStageCard stage={inProgress} />}

      <CompactList
        title="Заплановані"
        stages={stages.filter((s) => s.status === "PENDING")}
        tone="pending"
      />

      <CompactList
        title="Завершені"
        stages={stages.filter((s) => s.status === "COMPLETED")}
        tone="done"
      />
    </div>
  );
}

type StageType = {
  id: string;
  customName: string | null;
  stage: string | null;
  status: string;
  progress: number;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
  notes: string | null;
  unit: string | null;
  planVolume: unknown;
  factVolume: unknown;
  responsibleUser: { id: string; name: string | null; avatar: string | null } | null;
};

function GanttStrip({
  stages,
  projectStart,
  projectEnd,
}: {
  stages: StageType[];
  projectStart: Date | null;
  projectEnd: Date | null;
}) {
  if (!projectStart || !projectEnd) {
    return (
      <section
        className="rounded-2xl px-5 py-10 text-center text-[13px]"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Установи дати початку і завершення проєкту, щоб побачити календарний план
      </section>
    );
  }
  const startTs = new Date(projectStart).getTime();
  const endTs = new Date(projectEnd).getTime();
  const span = Math.max(1, endTs - startTs);
  const now = Date.now();
  const todayPct =
    now < startTs ? 0 : now > endTs ? 100 : Math.round(((now - startTs) / span) * 100);

  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <Layers size={16} style={{ color: T.accentPrimary }} />
          <h2 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            Календарний план
          </h2>
        </div>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {formatShortDate(projectStart)} — {formatShortDate(projectEnd)}
        </span>
      </header>
      <div style={{ borderTop: `1px solid ${T.borderSoft}` }} />
      <div className="px-5 py-4">
        <div
          className="relative h-7 mb-3 rounded-md"
          style={{ backgroundColor: T.panelSoft }}
        >
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${todayPct}%`,
              width: 2,
              backgroundColor: T.danger,
            }}
            title="Сьогодні"
          />
          <span
            className="absolute -top-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider"
            style={{
              left: `${todayPct}%`,
              transform: "translateX(-50%)",
              backgroundColor: T.danger,
              color: "#FFFFFF",
            }}
          >
            СЬОГОДНІ
          </span>
        </div>
        <ol className="flex flex-col gap-1.5">
          {stages.length === 0 && (
            <li className="text-[12px] py-2" style={{ color: T.textMuted }}>
              Етапів немає
            </li>
          )}
          {stages.map((s, i) => {
            if (!s.startDate || !s.endDate) {
              return (
                <li
                  key={s.id}
                  className="grid grid-cols-[28px_220px_1fr_50px] items-center gap-3 text-[12px]"
                >
                  <span
                    className="font-bold tabular-nums"
                    style={{ color: T.textMuted }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: T.textSecondary }}>
                    {s.customName ?? s.stage ?? `Етап ${i + 1}`}
                  </span>
                  <span style={{ color: T.textMuted }}>дати не задано</span>
                  <span className="text-right" style={{ color: T.textMuted }}>
                    {s.progress}%
                  </span>
                </li>
              );
            }
            const sStart = new Date(s.startDate).getTime();
            const sEnd = new Date(s.endDate).getTime();
            const leftPct = Math.max(0, ((sStart - startTs) / span) * 100);
            const widthPct = Math.max(2, ((sEnd - sStart) / span) * 100);
            const tone = stageTone(s.status);
            return (
              <li
                key={s.id}
                className="grid grid-cols-[28px_220px_1fr_50px] items-center gap-3"
              >
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: tone.fg }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-[12px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                  title={s.customName ?? s.stage ?? ""}
                >
                  {s.customName ?? s.stage ?? `Етап ${i + 1}`}
                </span>
                <div className="relative h-6">
                  <div
                    className="absolute top-0 bottom-0 rounded-md flex items-center justify-center"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: tone.bg,
                      border: `1px solid ${tone.fg}`,
                    }}
                  >
                    {s.status === "IN_PROGRESS" && (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-l-md"
                        style={{
                          width: `${Math.min(100, Math.max(0, s.progress))}%`,
                          backgroundColor: tone.fg,
                          opacity: 0.4,
                        }}
                      />
                    )}
                    {s.status === "COMPLETED" && (
                      <Check size={11} style={{ color: tone.fg }} />
                    )}
                  </div>
                </div>
                <span
                  className="text-[11px] font-bold tabular-nums text-right"
                  style={{ color: tone.fg }}
                >
                  {s.progress}%
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function ActiveStageCard({ stage }: { stage: StageType }) {
  const planVolume = Number(stage.planVolume ?? 0);
  const factVolume = Number(stage.factVolume ?? 0);
  const volumePct = planVolume > 0 ? Math.round((factVolume / planVolume) * 100) : 0;
  const startTs = stage.startDate ? new Date(stage.startDate).getTime() : null;
  const endTs = stage.endDate ? new Date(stage.endDate).getTime() : null;
  const daysLeft =
    endTs !== null ? Math.round((endTs - Date.now()) / 86_400_000) : null;
  const daysTotal =
    startTs !== null && endTs !== null
      ? Math.round((endTs - startTs) / 86_400_000)
      : null;

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: T.accentPrimary }}
      />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 px-5 pt-6 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: T.accentPrimary }}
              />
              АКТИВНИЙ ЕТАП
            </span>
          </div>
          <h2
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            {stage.customName ?? stage.stage ?? "Активний етап"}
          </h2>
          {stage.notes && (
            <p
              className="text-[13px] mt-1 line-clamp-2"
              style={{ color: T.textSecondary }}
            >
              {stage.notes}
            </p>
          )}
        </div>
        <div className="flex items-start gap-1.5">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Pencil size={15} style={{ color: T.textSecondary }} />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <MoreHorizontal size={15} style={{ color: T.textSecondary }} />
          </button>
          <button
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold"
            style={{ backgroundColor: T.success, color: "#FFFFFF" }}
          >
            <Check size={14} />
            Завершити
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 py-3">
        <Stat
          icon={TrendingUp}
          iconColor={T.accentPrimary}
          label="ПРОГРЕС"
          value={`${stage.progress}%`}
          sub={
            volumePct > 0
              ? `${formatVolume(factVolume)} / ${formatVolume(planVolume)} ${stage.unit ?? ""}`
              : "не задано"
          }
          progress={stage.progress}
          barColor={T.accentPrimary}
        />
        <Stat
          icon={Clock}
          iconColor={
            daysLeft === null
              ? T.textMuted
              : daysLeft < 0
                ? T.danger
                : daysLeft <= 14
                  ? T.warning
                  : T.success
          }
          label="ДНІВ ДО ЗАВЕРШЕННЯ"
          value={
            daysLeft === null
              ? "—"
              : daysLeft < 0
                ? `-${Math.abs(daysLeft)}`
                : String(daysLeft)
          }
          sub={
            daysLeft === null
              ? "дати не задано"
              : daysLeft < 0
                ? `прострочено ${Math.abs(daysLeft)} ${plural(Math.abs(daysLeft), "день", "дні", "днів")}`
                : daysTotal
                  ? `з ${daysTotal} ${plural(daysTotal, "дня", "днів", "днів")}`
                  : ""
          }
          progress={
            daysTotal !== null && daysLeft !== null
              ? Math.max(0, Math.min(100, ((daysTotal - daysLeft) / daysTotal) * 100))
              : null
          }
          barColor={
            daysLeft === null
              ? T.borderSoft
              : daysLeft < 0
                ? T.danger
                : daysLeft <= 14
                  ? T.warning
                  : T.success
          }
        />
        <Stat
          icon={Users}
          iconColor={T.violet}
          label="ВІДПОВІДАЛЬНИЙ"
          value={stage.responsibleUser?.name ?? "Не призначено"}
          sub={
            stage.responsibleUser
              ? "переглянути профіль"
              : "обери у налаштуваннях етапу"
          }
          progress={null}
          barColor={T.violet}
        />
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  iconColor,
  label,
  value,
  sub,
  progress,
  barColor,
}: {
  icon: typeof Clock;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  progress: number | null;
  barColor: string;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} style={{ color: iconColor }} />
        <span
          className="text-[10px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-[20px] font-bold tabular-nums truncate"
        style={{ color: T.textPrimary }}
        title={value}
      >
        {value}
      </div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: T.textMuted }}>
        {sub}
      </div>
      {progress !== null && (
        <div
          className="h-1 mt-2 overflow-hidden rounded-full"
          style={{ backgroundColor: T.panel }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      )}
    </div>
  );
}

function CompactList({
  title,
  stages,
  tone,
}: {
  title: string;
  stages: StageType[];
  tone: "pending" | "done";
}) {
  if (stages.length === 0) return null;
  const iconBg = tone === "done" ? T.successSoft : T.panelSoft;
  const iconColor = tone === "done" ? T.success : T.textMuted;
  return (
    <section
      className="rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          {tone === "done" ? (
            <Check size={16} style={{ color: iconColor }} />
          ) : (
            <Pause size={16} style={{ color: iconColor }} />
          )}
          <h3 className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
            {title}
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            {stages.length}
          </span>
        </div>
      </header>
      <ul style={{ borderTop: `1px solid ${T.borderSoft}` }} className="flex flex-col">
        {stages.map((s, i) => {
          const t = stageTone(s.status);
          return (
            <li
              key={s.id}
              className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 px-5 py-2.5"
              style={{ borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: t.fg,
                  color: "#FFFFFF",
                }}
              >
                {s.status === "COMPLETED" ? <Check size={11} /> : (s.sortOrder ?? "")}
              </span>
              <div className="min-w-0">
                <div
                  className="text-[13px] font-semibold truncate"
                  style={{ color: T.textPrimary }}
                >
                  {s.customName ?? s.stage ?? "Етап"}
                </div>
                {s.responsibleUser?.name && (
                  <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                    {s.responsibleUser.name}
                  </div>
                )}
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: T.textMuted }}>
                {s.startDate ? formatShortDate(s.startDate) : "—"}
                {" – "}
                {s.endDate ? formatShortDate(s.endDate) : "—"}
              </div>
              <ChevronRight size={14} style={{ color: T.textMuted }} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function stageTone(status: string): { bg: string; fg: string } {
  if (status === "COMPLETED") return { bg: T.successSoft, fg: T.success };
  if (status === "IN_PROGRESS") return { bg: T.accentPrimarySoft, fg: T.accentPrimary };
  return { bg: T.panelSoft, fg: T.textMuted };
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatVolume(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(n < 100 ? 1 : 0);
}
