import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Plus, Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { SectionTabs } from "../_components/section-tabs";
import { PageIntroCard } from "../_components/help/PageIntroCard";
import { EstimatesListClient, type EstimateRow } from "./_components/estimates-list-client";

const ESTIMATE_TABS = [
  { href: "/admin-v2/estimates", label: "Робочі", exact: true },
  { href: "/admin-v2/reference-estimates", label: "Довідкові" },
  { href: "/admin-v2/change-orders", label: "Дод. угоди" },
];

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

  const rows: EstimateRow[] = estimates.map((e) => ({
    id: e.id,
    number: e.number,
    title: e.title,
    status: e.status,
    totalAmount: Number(e.totalAmount ?? 0),
    discount: Number(e.discount ?? 0),
    finalAmount: Number(e.finalAmount ?? 0),
    createdAt: e.createdAt.toISOString(),
    projectTitle: e.project?.title ?? null,
    clientName: e.project?.client?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageIntroCard />
      <SectionTabs tabs={ESTIMATE_TABS} />
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
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Sparkles size={16} /> AI генератор
          </Link>
          <Link
            href="/admin-v2/estimates/new"
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:brightness-[0.97]"
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
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label="ВСЬОГО" value={String(estimates.length)} sub="кошторисів" />
        <KpiCard label="ЗАТВЕРДЖЕНИХ" value={String(approvedCount)} sub="готові до роботи" accent={T.success} />
        <KpiCard
          label="ЗАГАЛЬНА СУМА"
          value={formatCurrency(totalSum)}
          sub={`${draftCount} чернеток`}
          accent={T.accentPrimary}
        />
      </section>

      <EstimatesListClient estimates={rows} />
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
