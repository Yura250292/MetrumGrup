import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Users, Building2, HardHat, User as UserIcon, ListTodo, AlertCircle, Mic, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { KpiCard } from "./kpi-card";

export async function HrDashboard({ firstName, today }: { firstName: string; today: string }) {
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    employeesCount,
    activeEmployeesCount,
    counterpartiesCount,
    subcontractorsCount,
    activeSubcontractorsCount,
    clientsCount,
    activeTasksCount,
    overdueTasksCount,
    dueTodayTasksCount,
    completedWeekTasksCount,
    meetingsThisMonth,
    recentEmployees,
    recentSubcontractors,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { isActive: true } }),
    prisma.counterparty.count({ where: { isActive: true } }),
    prisma.worker.count(),
    prisma.worker.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.task.count({ where: { isArchived: false, status: { isDone: false } } }),
    prisma.task.count({
      where: { isArchived: false, status: { isDone: false }, dueDate: { lt: now } },
    }),
    prisma.task.count({
      where: {
        isArchived: false,
        status: { isDone: false },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
    }),
    prisma.task.count({
      where: { status: { isDone: true }, completedAt: { gte: startOfWeek } },
    }),
    prisma.meeting.count({ where: { recordedAt: { gte: startOfMonth } } }),
    prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, fullName: true, position: true, isActive: true, createdAt: true },
    }),
    prisma.worker.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, specialty: true, isActive: true, availableFrom: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <section
        className="rounded-2xl p-5 sm:p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            HR · {today}
          </span>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Вітаю, {firstName}
          </h1>
          <p className="text-[14px]" style={{ color: T.textSecondary }}>
            {activeEmployeesCount} активних співробітників · {activeSubcontractorsCount} підрядників ·{" "}
            {counterpartiesCount} контрагентів
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="px-1 text-[11px] font-bold tracking-widest" style={{ color: T.textMuted }}>
          КАРТОТЕКА
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="СПІВРОБІТНИКИ"
            value={String(employeesCount)}
            sub={`${activeEmployeesCount} активних`}
            icon={Users}
            accent={T.accentPrimary}
            href="/admin-v2/hr/employees"
          />
          <KpiCard
            label="КОНТРАГЕНТИ"
            value={String(counterpartiesCount)}
            sub="активних"
            icon={Building2}
            accent={T.accentPrimary}
            href="/admin-v2/hr/counterparties"
          />
          <KpiCard
            label="ПІДРЯДНИКИ"
            value={String(subcontractorsCount)}
            sub={`${activeSubcontractorsCount} активних`}
            icon={HardHat}
            accent={T.accentPrimary}
            href="/admin-v2/hr/subcontractors"
          />
          <KpiCard
            label="КЛІЄНТИ"
            value={String(clientsCount)}
            sub="облікових записів"
            icon={UserIcon}
            accent={T.accentPrimary}
            href="/admin-v2/clients"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="px-1 text-[11px] font-bold tracking-widest" style={{ color: T.textMuted }}>
          МОЇ ЗАДАЧІ ТА НАРАДИ
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="АКТИВНІ ЗАДАЧІ"
            value={String(activeTasksCount)}
            sub={`${completedWeekTasksCount} завершено за тиждень`}
            icon={ListTodo}
            accent={T.accentPrimary}
            href="/admin-v2/me"
          />
          <KpiCard
            label="ПРОСТРОЧЕНО"
            value={String(overdueTasksCount)}
            sub={`${dueTodayTasksCount} на сьогодні`}
            icon={AlertCircle}
            accent={overdueTasksCount > 0 ? T.danger : T.textMuted}
            href="/admin-v2/me"
          />
          <KpiCard
            label="НАРАД ЗА МІСЯЦЬ"
            value={String(meetingsThisMonth)}
            sub="записано"
            icon={Mic}
            accent={T.accentPrimary}
            href="/admin-v2/meetings"
          />
          <KpiCard
            label="ЗАВЕРШЕНО"
            value={String(completedWeekTasksCount)}
            sub="за тиждень"
            icon={CheckCircle2}
            accent={T.success}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Нові співробітники
            </h3>
            <Link
              href="/admin-v2/hr/employees"
              className="text-[12px] font-semibold"
              style={{ color: T.accentPrimary }}
            >
              Усі →
            </Link>
          </div>
          {recentEmployees.length === 0 ? (
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              Ще немає записів.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentEmployees.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: T.panelSoft }}
                >
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {e.fullName}
                    </span>
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      {e.position ?? "—"}
                    </span>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: e.isActive ? T.successSoft : T.panelElevated,
                      color: e.isActive ? T.success : T.textMuted,
                    }}
                  >
                    {e.isActive ? "Активний" : "Неактивний"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Нові підрядники
            </h3>
            <Link
              href="/admin-v2/hr/subcontractors"
              className="text-[12px] font-semibold"
              style={{ color: T.accentPrimary }}
            >
              Усі →
            </Link>
          </div>
          {recentSubcontractors.length === 0 ? (
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              Ще немає записів.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentSubcontractors.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: T.panelSoft }}
                >
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {w.name}
                    </span>
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      {w.specialty}
                      {w.availableFrom
                        ? ` · з ${new Date(w.availableFrom).toLocaleDateString("uk-UA")}`
                        : ""}
                    </span>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: w.isActive ? T.successSoft : T.panelElevated,
                      color: w.isActive ? T.success : T.textMuted,
                    }}
                  >
                    {w.isActive ? "Активний" : "Неактивний"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
