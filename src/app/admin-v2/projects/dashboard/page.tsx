import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import {
  Table as TableIcon,
  Users,
  HardHat,
  Calculator,
  ArrowRight,
  FolderKanban,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DeleteProjectButton } from "./_components/delete-project-button";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
  firmWhereForProject,
} from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

export default async function AdminV2ProjectsDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    redirect("/admin-v2");
  }

  const [projects, managers] = await Promise.all([
    prisma.project.findMany({
      where: firmWhereForProject(firmId),
      include: {
        client: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        crewAssignments: {
          where: { endDate: null },
          include: {
            worker: { select: { id: true, name: true, specialty: true } },
          },
          orderBy: { startDate: "desc" },
        },
        estimates: {
          where: {
            status: { in: ["APPROVED", "SENT", "FINANCE_REVIEW", "ENGINEER_REVIEW"] },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            number: true,
            finalAmount: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            estimates: true,
            crewAssignments: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "MANAGER", ...(firmId ? { firmId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalEstimateValue = projects.reduce(
    (sum, p) => sum + (p.estimates[0] ? Number(p.estimates[0].finalAmount) : 0),
    0
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ПОВНА КАРТИНА
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Огляд проєктів
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Управління проєктами, бригадами та кошторисами
        </p>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label="ВСЬОГО ПРОЄКТІВ" value={String(projects.length)} sub={`${managers.length} менеджерів`} />
        <KpiCard
          label="АКТИВНІ КОШТОРИСИ"
          value={formatCurrency(totalEstimateValue)}
          sub="у роботі"
          accent={T.accentPrimary}
        />
        <KpiCard
          label="ПРАЦЮЮТЬ ЗАРАЗ"
          value={String(projects.reduce((sum, p) => sum + p.crewAssignments.length, 0))}
          sub="робітників на обʼєктах"
          accent={T.success}
        />
      </section>

      {/* Table */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <section
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div
            className="flex items-center justify-between border-b px-6 py-4"
            style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
          >
            <div className="flex items-center gap-2.5">
              <TableIcon size={18} style={{ color: T.accentPrimary }} />
              <span className="text-base font-bold" style={{ color: T.textPrimary }}>
                Усі проєкти
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: T.panel, color: T.textSecondary }}
              >
                {projects.length}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>ПРОЄКТ</Th>
                  <Th>КЛІЄНТ</Th>
                  <Th>МЕНЕДЖЕР</Th>
                  <Th>БРИГАДА</Th>
                  <Th>АКТИВНИЙ КОШТОРИС</Th>
                  <Th>СТАТУС</Th>
                  <Th align="right">ДІЯ</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const estimate = p.estimates[0];
                  const crewSpecialties = Array.from(
                    new Set(p.crewAssignments.map((a) => a.worker.specialty))
                  );
                  return (
                    <tr
                      key={p.id}
                      style={{
                        backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: T.accentPrimarySoft }}
                          >
                            <FolderKanban size={14} style={{ color: T.accentPrimary }} />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span
                              className="text-[13px] font-semibold truncate max-w-[200px]"
                              style={{ color: T.textPrimary }}
                            >
                              {p.title}
                            </span>
                            <span className="text-[10px]" style={{ color: T.textMuted }}>
                              {p._count.estimates} кошторис(и)
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textSecondary }}>
                        {p.client.name}
                      </td>
                      <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textSecondary }}>
                        {p.manager?.name || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {p.crewAssignments.length === 0 ? (
                          <span className="text-[11px]" style={{ color: T.textMuted }}>
                            —
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <HardHat size={12} style={{ color: T.success }} />
                              <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                                {p.crewAssignments.length}
                              </span>
                            </div>
                            {crewSpecialties.length > 0 && (
                              <span
                                className="text-[10px] truncate max-w-[120px]"
                                style={{ color: T.textMuted }}
                              >
                                {crewSpecialties.slice(0, 2).join(", ")}
                                {crewSpecialties.length > 2 && "…"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {estimate ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="text-[12px] font-semibold"
                              style={{ color: T.textPrimary }}
                            >
                              {formatCurrency(Number(estimate.finalAmount))}
                            </span>
                            <span className="text-[10px]" style={{ color: T.textMuted }}>
                              {estimate.number} ·{" "}
                              {ESTIMATE_STATUS_LABELS[estimate.status] ?? estimate.status}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px]" style={{ color: T.textMuted }}>
                            немає
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/admin-v2/projects/${p.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                          >
                            Деталі <ArrowRight size={11} />
                          </Link>
                          {session.user.role === "SUPER_ADMIN" && (
                            <DeleteProjectButton projectId={p.id} projectTitle={p.title} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-3 sm:p-5 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[10px] sm:text-[11px] hidden sm:block truncate" style={{ color: T.textMuted }}>
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
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
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
        <TableIcon size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Проєктів немає
      </span>
    </div>
  );
}
