import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import {
  FolderKanban,
  Users,
  Calculator,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [
    projectsCount,
    activeProjectsCount,
    clientsCount,
    estimatesCount,
    totalRevenue,
    recentProjects,
    overduePayments,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.estimate.count(),
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.project.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        scheduledDate: { lt: new Date() },
      },
      include: {
        project: { select: { title: true } },
      },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
  ]);

  const revenue = Number(totalRevenue._sum.amount || 0);

  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          {today.toUpperCase()}
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Вітаємо, {session.user.name?.split(" ")[0] || "Адміністратор"}
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Огляд показників компанії на сьогодні
        </p>
      </section>

      {/* KPI grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="ПРОЄКТИ"
          value={String(projectsCount)}
          sub={`${activeProjectsCount} активних`}
          icon={FolderKanban}
          accent={T.accentPrimary}
        />
        <KpiCard
          label="КЛІЄНТИ"
          value={String(clientsCount)}
          sub="облікових записів"
          icon={Users}
          accent={T.success}
        />
        <KpiCard
          label="КОШТОРИСИ"
          value={String(estimatesCount)}
          sub="створено"
          icon={Calculator}
          accent={T.warning}
        />
        <KpiCard
          label="ДОХІД"
          value={formatCurrency(revenue)}
          sub="сплачено"
          icon={TrendingUp}
          accent={T.accentSecondary}
        />
      </section>

      {/* Two-column workspace */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent projects */}
        <div
          className="xl:col-span-2 rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ОСТАННЯ АКТИВНІСТЬ
              </span>
              <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
                Останні проєкти
              </h2>
            </div>
            <Link
              href="/admin/projects"
              className="flex items-center gap-1.5 text-xs font-semibold transition hover:brightness-125"
              style={{ color: T.accentPrimary }}
            >
              Усі проєкти <ArrowRight size={14} />
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <EmptyProjects />
          ) : (
            <div className="flex flex-col gap-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin-v2/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-xl p-3.5 transition hover:brightness-125"
                  style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                  >
                    {project.client?.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold" style={{ color: T.textPrimary }}>
                        {project.title}
                      </span>
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: T.textMuted }}>
                      <span className="truncate">{project.client?.name}</span>
                      {project.manager?.name && (
                        <>
                          <span>·</span>
                          <span className="truncate">Менеджер: {project.manager.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={16} style={{ color: T.textMuted }} className="flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Overdue payments */}
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ФІНАНСОВИЙ СТАН
              </span>
              <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
                Прострочені платежі
              </h2>
            </div>
            {overduePayments.length > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              >
                {overduePayments.length}
              </span>
            )}
          </div>

          {overduePayments.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 rounded-xl p-6"
              style={{ backgroundColor: T.successSoft }}
            >
              <CheckCircle2 size={32} style={{ color: T.success }} />
              <span className="text-[13px] font-semibold" style={{ color: T.success }}>
                Всі платежі оплачені вчасно
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                Прострочених платежів немає
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {overduePayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-start gap-3 rounded-xl p-3.5"
                  style={{
                    backgroundColor: T.panelElevated,
                    borderLeft: `3px solid ${T.danger}`,
                  }}
                >
                  <AlertCircle size={16} style={{ color: T.danger }} className="mt-0.5 flex-shrink-0" />
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                      {payment.project.title}
                    </div>
                    <div className="text-[11px]" style={{ color: T.textMuted }}>
                      Дата: {formatDateShort(payment.scheduledDate)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0 flex-shrink-0">
                    <span className="text-[13px] font-bold" style={{ color: T.danger }}>
                      {formatCurrency(Number(payment.amount))}
                    </span>
                    <span className="text-[10px]" style={{ color: T.textMuted }}>
                      Прострочено
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section
        className="rounded-2xl p-6"
        style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Sparkles size={20} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0">
              <div className="text-sm font-bold" style={{ color: T.textPrimary }}>
                Спробуйте AI генератор кошторисів
              </div>
              <div className="text-[12px]" style={{ color: T.textSecondary }}>
                Створіть детальний кошторис із PDF-документів за ~3 хвилини
              </div>
            </div>
          </div>
          <Link
            href="/ai-estimate-v2"
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Sparkles size={16} /> Згенерувати
          </Link>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  accent: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl p-6"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          {label}
        </span>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-3xl md:text-4xl font-bold mt-2" style={{ color: T.textPrimary }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: T.textMuted }}>
        {sub}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof PROJECT_STATUS_LABELS }) {
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

function EmptyProjects() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl p-8 text-center"
      style={{ backgroundColor: T.panelElevated }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FolderKanban size={24} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
        Немає проєктів
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший проєкт, щоб почати роботу
      </span>
      <Link
        href="/admin-v2/projects/new"
        className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={16} /> Створити проєкт
      </Link>
    </div>
  );
}
