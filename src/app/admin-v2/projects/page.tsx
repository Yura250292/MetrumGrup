import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, STAGE_LABELS } from "@/lib/constants";
import {
  FolderKanban,
  Plus,
  ArrowRight,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Wallet,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await listProjectsWithAggregations(session.user.id);

  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalPaid = projects.reduce((sum, p) => sum + p.totalPaid, 0);
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ВСІ ПРОЄКТИ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Проєкти
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {projects.length} {projects.length === 1 ? "проєкт" : "проєктів"} · {activeCount} активних
          </p>
        </div>
        <Link
          href="/admin/projects/new"
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Новий проєкт
        </Link>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="ВСЬОГО" value={String(projects.length)} sub="у системі" />
        <KpiCard
          label="ЗАГАЛЬНИЙ БЮДЖЕТ"
          value={formatCurrency(totalBudget)}
          sub={`${formatCurrency(totalPaid)} сплачено`}
          accent={T.accentPrimary}
        />
        <KpiCard
          label="ВИКОНАННЯ ОПЛАТ"
          value={`${totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0}%`}
          sub="від загальної суми"
          accent={T.success}
        />
      </section>

      {/* List */}
      <section className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          projects.map((project) => {
            const paidPercent =
              project.totalBudget > 0
                ? Math.min(100, Math.round((project.totalPaid / project.totalBudget) * 100))
                : 0;

            return (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="flex flex-col gap-4 rounded-2xl p-6 transition hover:brightness-125"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold truncate" style={{ color: T.textPrimary }}>
                        {project.title}
                      </span>
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
                      <span className="font-medium" style={{ color: T.textSecondary }}>
                        {project.client.name}
                      </span>
                      {project.manager && (
                        <>
                          <span>·</span>
                          <span>Менеджер: {project.manager.name}</span>
                        </>
                      )}
                      {project.address && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 truncate">
                            <MapPin size={12} /> {project.address}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={18} style={{ color: T.textMuted }} className="flex-shrink-0 mt-1" />
                </div>

                {/* Stage progress */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: T.textMuted }}>
                      Етап:{" "}
                      <span style={{ color: T.textSecondary }}>{STAGE_LABELS[project.currentStage]}</span>
                    </span>
                    <span className="font-bold" style={{ color: T.accentPrimary }}>
                      {project.stageProgress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${project.stageProgress}%`, backgroundColor: T.accentPrimary }}
                    />
                  </div>
                </div>

                {/* Footer row: budget + activity */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: T.textMuted }}>
                    <span className="flex items-center gap-1.5">
                      <Wallet size={13} style={{ color: T.success }} />
                      <span style={{ color: T.textSecondary }}>{formatCurrency(project.totalPaid)}</span>
                      <span>/</span>
                      <span>{formatCurrency(project.totalBudget)}</span>
                      <span className="font-bold" style={{ color: T.success }}>
                        ({paidPercent}%)
                      </span>
                    </span>
                    {project.commentCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessagesSquare size={12} /> {project.commentCount}
                      </span>
                    )}
                    {project.unreadChatCount > 0 && (
                      <span className="flex items-center gap-1 font-bold" style={{ color: T.accentPrimary }}>
                        <MessageSquare size={12} /> {project.unreadChatCount} нових
                      </span>
                    )}
                  </div>
                  {project.startDate && (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      Старт: {formatDateShort(project.startDate)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold mt-1" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        {sub}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const label = PROJECT_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    ACTIVE: { bg: T.successSoft, fg: T.success },
    ON_HOLD: { bg: T.warningSoft, fg: T.warning },
    COMPLETED: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    CANCELLED: { bg: T.dangerSoft, fg: T.danger },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FolderKanban size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Проєктів ще немає
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший проєкт, щоб почати роботу
      </span>
      <Link
        href="/admin/projects/new"
        className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={16} /> Створити проєкт
      </Link>
    </div>
  );
}
