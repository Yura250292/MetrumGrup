import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import {
  FileText,
  Plus,
  Sparkles,
  Calculator,
  ArrowRight,
  Search,
} from "lucide-react";
import type { EstimateStatus } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2EstimatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }

  const estimates = await prisma.estimate.findMany({
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      totalAmount: true,
      discount: true,
      finalAmount: true,
      createdAt: true,
      project: { select: { title: true, client: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalSum = estimates.reduce((sum, e) => sum + Number(e.finalAmount ?? 0), 0);
  const approvedCount = estimates.filter((e) => e.status === "APPROVED").length;
  const draftCount = estimates.filter((e) => e.status === "DRAFT").length;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ВСІ КОШТОРИСИ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Кошториси
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Згенеровані AI та створені вручну кошториси по проєктах
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ai-estimate-v2"
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Sparkles size={16} /> AI генератор
          </Link>
          <Link
            href="/admin-v2/estimates/new"
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:brightness-125"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <Plus size={16} /> Створити вручну
          </Link>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="ВСЬОГО" value={String(estimates.length)} sub="кошторисів" />
        <KpiCard label="ЗАТВЕРДЖЕНИХ" value={String(approvedCount)} sub="готові до роботи" accent={T.success} />
        <KpiCard
          label="ЗАГАЛЬНА СУМА"
          value={formatCurrency(totalSum)}
          sub={`${draftCount} чернеток`}
          accent={T.accentPrimary}
        />
      </section>

      {/* List */}
      <section
        className="rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="flex items-center justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-2.5">
            <FileText size={18} style={{ color: T.accentPrimary }} />
            <span className="text-base font-bold" style={{ color: T.textPrimary }}>
              Всі кошториси
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            >
              {estimates.length}
            </span>
          </div>
          <div
            className="hidden md:flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
          >
            <Search size={14} style={{ color: T.textMuted }} />
            <span className="text-xs" style={{ color: T.textMuted }}>
              Пошук скоро з'явиться
            </span>
          </div>
        </div>

        {estimates.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col">
            {estimates.map((est, i) => (
              <Link
                key={est.id}
                href={`/admin-v2/estimates/${est.id}`}
                className="flex items-center gap-4 px-6 py-4 transition hover:brightness-125"
                style={{
                  backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <Calculator size={20} style={{ color: T.accentPrimary }} />
                </div>
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                      {est.title}
                    </span>
                    <StatusBadge status={est.status} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] flex-wrap" style={{ color: T.textMuted }}>
                    <span>{est.number}</span>
                    {est.project?.title && (
                      <>
                        <span>·</span>
                        <span className="truncate">{est.project.title}</span>
                      </>
                    )}
                    {est.project?.client?.name && (
                      <>
                        <span>·</span>
                        <span className="truncate">{est.project.client.name}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatDateShort(est.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-base font-bold" style={{ color: T.textPrimary }}>
                    {formatCurrency(Number(est.finalAmount ?? 0))}
                  </span>
                  {Number(est.discount ?? 0) > 0 && (
                    <span className="text-[10px] line-through" style={{ color: T.textMuted }}>
                      {formatCurrency(Number(est.totalAmount ?? 0))}
                    </span>
                  )}
                </div>
                <ArrowRight size={16} style={{ color: T.textMuted }} className="flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = T.accentPrimary,
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

function StatusBadge({ status }: { status: EstimateStatus }) {
  const label = ESTIMATE_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    SENT: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    APPROVED: { bg: T.successSoft, fg: T.success },
    REJECTED: { bg: T.dangerSoft, fg: T.danger },
    REVISION: { bg: T.warningSoft, fg: T.warning },
    ENGINEER_REVIEW: { bg: T.warningSoft, fg: T.warning },
    FINANCE_REVIEW: { bg: T.warningSoft, fg: T.warning },
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
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FileText size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Кошторисів ще немає
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший — швидко через AI або вручну
      </span>
      <div className="mt-3 flex gap-2">
        <Link
          href="/ai-estimate-v2"
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Sparkles size={16} /> AI генератор
        </Link>
        <Link
          href="/admin-v2/estimates/new"
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <Plus size={16} /> Вручну
        </Link>
      </div>
    </div>
  );
}
