import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewFinance } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ArrowUpRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Search,
  User,
  Users,
  UserX,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "HR"];

export default async function EmployeesV2Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; dept?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const showFinance = canViewFinance(session.user.role);
  const sp = await searchParams;
  const filter = sp.filter ?? "active";
  const deptFilter = sp.dept ?? null;

  const where: Record<string, unknown> = {};
  if (filter === "active") where.isActive = true;
  if (filter === "inactive") where.isActive = false;
  if (deptFilter) where.departmentId = deptFilter;

  const [employees, totalCount, activeCount, inactiveCount, departments, teamsCount] =
    await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeNumber: true,
          fullName: true,
          position: true,
          phone: true,
          email: true,
          hiredAt: true,
          terminatedAt: true,
          isActive: true,
          employmentRate: true,
          department: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, avatar: true, role: true } },
          _count: {
            select: {
              teamMemberships: true,
              payrollPeriods: true,
            },
          },
        },
        orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
        take: 100,
      }),
      prisma.employee.count(),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { isActive: false } }),
      prisma.department.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { employees: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.team.count().catch(() => 0),
    ]);

  // Payroll snapshot (latest period). Only for SUPER_ADMIN per RBAC rule.
  let latestPeriod: string | null = null;
  let latestPeriodPayrollTotal = 0;
  let latestPeriodEmployeeCount = 0;
  if (showFinance) {
    const lastPeriodRows = await prisma.employeePayrollPeriod.findMany({
      select: { period: true },
      orderBy: { period: "desc" },
      take: 1,
    });
    latestPeriod = lastPeriodRows[0]?.period ?? null;
    if (latestPeriod) {
      const agg = await prisma.employeePayrollPeriod.aggregate({
        where: { period: latestPeriod },
        _sum: { officialPart: true, totalSum: true },
        _count: { id: true },
      });
      latestPeriodPayrollTotal = Number(agg._sum.totalSum ?? agg._sum.officialPart ?? 0);
      latestPeriodEmployeeCount = agg._count.id;
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Працівники
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textSecondary }}>
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {activeCount}
            </span>{" "}
            активних · {departments.length} підрозділів · {teamsCount} команд
            {showFinance && latestPeriod && (
              <> · ЗП за <span className="font-semibold">{latestPeriod}</span></>
            )}
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
            href="/admin-v2/hr/employees"
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
            href="/admin-v2/hr/employees/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
          >
            <Plus size={14} />
            Додати
          </Link>
        </div>
      </header>

      <KpiStrip
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        deptCount={departments.length}
        teamsCount={teamsCount}
        showFinance={showFinance}
        latestPeriod={latestPeriod}
        latestPeriodPayrollTotal={latestPeriodPayrollTotal}
        latestPeriodEmployeeCount={latestPeriodEmployeeCount}
      />

      <Toolbar
        activeFilter={filter}
        activeDept={deptFilter}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        totalCount={totalCount}
        departments={departments}
      />

      <EmployeeTable rows={employees} />
    </div>
  );
}

function KpiStrip({
  totalCount,
  activeCount,
  inactiveCount,
  deptCount,
  teamsCount,
  showFinance,
  latestPeriod,
  latestPeriodPayrollTotal,
  latestPeriodEmployeeCount,
}: {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  deptCount: number;
  teamsCount: number;
  showFinance: boolean;
  latestPeriod: string | null;
  latestPeriodPayrollTotal: number;
  latestPeriodEmployeeCount: number;
}) {
  const cards: Array<{
    icon: typeof Users;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string;
    sub: string;
    dark?: boolean;
  }> = [
    {
      icon: Users,
      iconBg: T.accentPrimarySoft,
      iconColor: T.accentPrimary,
      label: "АКТИВНІ",
      value: String(activeCount),
      sub: `з ${totalCount} всього`,
    },
    {
      icon: Briefcase,
      iconBg: T.skySoft,
      iconColor: T.sky,
      label: "ПІДРОЗДІЛИ",
      value: String(deptCount),
      sub: `${teamsCount} команд`,
    },
    {
      icon: UserX,
      iconBg: inactiveCount > 0 ? T.warningSoft : T.successSoft,
      iconColor: inactiveCount > 0 ? T.warning : T.success,
      label: "НЕАКТИВНІ",
      value: String(inactiveCount),
      sub: inactiveCount > 0 ? "звільнено / в архіві" : "усі працюють",
    },
  ];
  if (showFinance && latestPeriod) {
    cards.push({
      icon: Calendar,
      iconBg: T.violetSoft,
      iconColor: T.violet,
      label: `ЗП ${latestPeriod}`,
      value: formatCompact(latestPeriodPayrollTotal),
      sub: `${latestPeriodEmployeeCount} ${plural(latestPeriodEmployeeCount, "запис", "записи", "записів")}`,
      dark: true,
    });
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
  activeFilter,
  activeDept,
  activeCount,
  inactiveCount,
  totalCount,
  departments,
}: {
  activeFilter: string;
  activeDept: string | null;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
  departments: Array<{ id: string; name: string; _count: { employees: number } }>;
}) {
  const segments = [
    { key: "active", label: "Активні", count: activeCount, color: T.success },
    { key: "inactive", label: "Неактивні", count: inactiveCount, color: T.textMuted },
    { key: "all", label: "Всі", count: totalCount, color: T.textPrimary },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] max-w-md"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={14} style={{ color: T.textMuted }} />
        <input
          type="search"
          placeholder="Пошук за ім'ям або табельним…"
          className="bg-transparent border-0 outline-none flex-1 text-[13px]"
          style={{ color: T.textPrimary }}
          disabled
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((s) => {
          const isActive = activeFilter === s.key;
          const href = `/admin-v2/employees-v2?filter=${s.key}`;
          return (
            <Link
              key={s.key}
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
      <div className="flex flex-wrap items-center gap-1">
        {departments.slice(0, 6).map((d) => {
          const isActive = activeDept === d.id;
          const href = isActive
            ? `/admin-v2/employees-v2?filter=${activeFilter}`
            : `/admin-v2/employees-v2?filter=${activeFilter}&dept=${d.id}`;
          return (
            <Link
              key={d.id}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:brightness-95"
              style={{
                backgroundColor: isActive ? T.accentPrimarySoft : T.panelSoft,
                color: isActive ? T.accentPrimary : T.textSecondary,
              }}
            >
              {d.name}
              <span className="opacity-60">{d._count.employees}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type EmpRow = {
  id: string;
  employeeNumber: string | null;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  hiredAt: Date | null;
  terminatedAt: Date | null;
  isActive: boolean;
  employmentRate: unknown;
  department: { id: string; name: string } | null;
  user: { id: string; name: string | null; avatar: string | null; role: string } | null;
  _count: { teamMemberships: number; payrollPeriods: number };
};

function EmployeeTable({ rows }: { rows: EmpRow[] }) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <header
        className="hidden md:grid grid-cols-[1fr_200px_180px_120px_140px_20px] gap-3 px-5 py-2.5 text-[10px] font-bold tracking-wider"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <span>ПРАЦІВНИК · ТАБЕЛЬНИЙ</span>
        <span>ПІДРОЗДІЛ · ПОСАДА</span>
        <span>КОНТАКТИ</span>
        <span className="text-right">СТАВКА</span>
        <span>СТАЖ</span>
        <span />
      </header>
      <ul className="flex flex-col">
        {rows.length === 0 && (
          <li className="px-5 py-10 text-center text-[13px]" style={{ color: T.textMuted }}>
            Працівників за цим фільтром немає
          </li>
        )}
        {rows.map((r, idx) => {
          const rate = Number(r.employmentRate ?? 1);
          const tenureMonths = r.hiredAt
            ? Math.floor(
                (Date.now() - new Date(r.hiredAt).getTime()) /
                  (30.4 * 86_400_000),
              )
            : 0;
          const tenureYears = Math.floor(tenureMonths / 12);
          const initials = r.fullName
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("");
          const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
          return (
            <li key={r.id}>
              <Link
                href={`/admin-v2/hr/employees/${r.id}`}
                className="grid md:grid-cols-[1fr_200px_180px_120px_140px_20px] gap-3 px-5 py-3 transition hover:brightness-95"
                style={{
                  borderTop: idx > 0 ? `1px solid ${T.borderSoft}` : "none",
                  opacity: r.isActive ? 1 : 0.55,
                }}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 text-[12px] font-bold relative"
                    style={{
                      backgroundColor: r.isActive ? avatarColor : T.panelSoft,
                      color: r.isActive ? "#FFFFFF" : T.textMuted,
                    }}
                  >
                    {initials || <User size={16} />}
                    {r.user && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: T.panel,
                          border: `1.5px solid ${T.success}`,
                        }}
                        title="З акаунтом"
                      >
                        <CheckCircle2 size={8} style={{ color: T.success }} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {r.fullName}
                    </div>
                    <div
                      className="text-[11px] mt-0.5 truncate tabular-nums"
                      style={{ color: T.textMuted }}
                    >
                      {r.employeeNumber ? `№ ${r.employeeNumber}` : "табельного немає"}
                      {!r.isActive && " · звільнено"}
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  {r.department && (
                    <div
                      className="text-[12px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {r.department.name}
                    </div>
                  )}
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: T.textMuted }}>
                    {r.position ?? "—"}
                  </div>
                </div>
                <div className="min-w-0 flex flex-col gap-0.5">
                  {r.phone && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] truncate"
                      style={{ color: T.textSecondary }}
                    >
                      <Phone size={10} style={{ color: T.textMuted }} />
                      {r.phone}
                    </span>
                  )}
                  {r.email && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] truncate"
                      style={{ color: T.textSecondary }}
                    >
                      <Mail size={10} style={{ color: T.textMuted }} />
                      {r.email}
                    </span>
                  )}
                  {!r.phone && !r.email && (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      без контактів
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className="text-[14px] font-bold tabular-nums"
                    style={{
                      color:
                        rate >= 1
                          ? T.textPrimary
                          : rate >= 0.5
                            ? T.warning
                            : T.textMuted,
                    }}
                  >
                    {rate.toFixed(2)}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                    {r._count.teamMemberships > 0 && `${r._count.teamMemberships} команд`}
                  </div>
                </div>
                <div>
                  {r.hiredAt ? (
                    <>
                      <div
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: T.textPrimary }}
                      >
                        {tenureYears > 0
                          ? `${tenureYears} р`
                          : `${tenureMonths} міс`}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                        з {formatDateShort(r.hiredAt)}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      —
                    </span>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  style={{ color: T.textMuted }}
                  className="self-center hidden md:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const AVATAR_COLORS = [
  T.violet,
  T.sky,
  T.accentPrimary,
  T.amber,
  T.emerald,
  T.rose,
  T.teal,
];

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₴`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K ₴`;
  return `${n.toFixed(0)} ₴`;
}

function formatDateShort(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}
