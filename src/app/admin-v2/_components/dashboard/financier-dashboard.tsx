import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Truck,
  Wallet,
  HardHat,
  AlertTriangle,
  FileText,
  Plus,
  Building2,
  ListTodo,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { KpiCard } from "./kpi-card";
import { formatCurrency } from "@/lib/utils";

type DebtRow = {
  counterpartyId: string;
  name: string;
  outstanding: number;
};

type RecentInvoice = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  occurredAt: Date;
  status: string;
  counterpartyName: string | null;
  projectTitle: string | null;
};

type PendingForemanReport = {
  id: string;
  authorName: string | null;
  projectTitle: string | null;
  submittedAt: Date | null;
  itemsTotal: number;
};

export async function FinancierDashboard({
  firstName,
  today,
  firmId,
}: {
  firstName: string;
  today: string;
  firmId: string | null;
}) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firmScope = firmId ? { firmId } : {};

  // Debt = sum of unpaid supplier-side FinanceEntry (EXPENSE/FACT/APPROVED, with counterpartyId).
  // Paid this month = sum of SupplierPayment.POSTED, occurredAt >= startOfMonth.
  // Все рахуємо сирими сумами; UI показує перші орієнтири, точні цифри — у ledger.
  const [
    debtAggregate,
    paidThisMonthAggregate,
    counterpartiesWithDebt,
    pendingForemanCount,
    topDebtsRaw,
    recentInvoicesRaw,
    pendingForemanReportsRaw,
  ] = await Promise.all([
    prisma.financeEntry.aggregate({
      _sum: { amount: true },
      where: {
        type: "EXPENSE",
        kind: "FACT",
        status: "APPROVED",
        counterpartyId: { not: null },
        isArchived: false,
        ...firmScope,
      },
    }),
    prisma.supplierPayment.aggregate({
      _sum: { amount: true },
      where: {
        status: "POSTED",
        occurredAt: { gte: startOfMonth },
        ...(firmId ? { firmId } : {}),
      },
    }),
    prisma.financeEntry.findMany({
      where: {
        type: "EXPENSE",
        kind: "FACT",
        status: "APPROVED",
        counterpartyId: { not: null },
        isArchived: false,
        ...firmScope,
      },
      distinct: ["counterpartyId"],
      select: { counterpartyId: true },
    }),
    prisma.foremanReport.count({
      where: {
        status: "PENDING_APPROVAL",
        ...(firmId ? { project: { firmId } } : {}),
      },
    }),
    prisma.financeEntry.groupBy({
      by: ["counterpartyId"],
      _sum: { amount: true },
      where: {
        type: "EXPENSE",
        kind: "FACT",
        status: "APPROVED",
        counterpartyId: { not: null },
        isArchived: false,
        ...firmScope,
      },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    prisma.financeEntry.findMany({
      where: {
        type: "EXPENSE",
        kind: "FACT",
        counterpartyId: { not: null },
        isArchived: false,
        ...firmScope,
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        amount: true,
        currency: true,
        occurredAt: true,
        status: true,
        counterpartyId: true,
        project: { select: { title: true } },
      },
    }),
    prisma.foremanReport.findMany({
      where: {
        status: "PENDING_APPROVAL",
        ...(firmId ? { project: { firmId } } : {}),
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: {
        id: true,
        submittedAt: true,
        createdBy: { select: { name: true } },
        project: { select: { title: true } },
        items: { select: { amount: true } },
      },
    }),
  ]);

  const counterpartyIdsToResolve = new Set<string>();
  for (const row of topDebtsRaw) {
    if (row.counterpartyId) counterpartyIdsToResolve.add(row.counterpartyId);
  }
  for (const inv of recentInvoicesRaw) {
    if (inv.counterpartyId) counterpartyIdsToResolve.add(inv.counterpartyId);
  }
  const counterpartyMap = new Map<string, string>();
  if (counterpartyIdsToResolve.size > 0) {
    const rows = await prisma.counterparty.findMany({
      where: { id: { in: Array.from(counterpartyIdsToResolve) } },
      select: { id: true, name: true },
    });
    for (const r of rows) counterpartyMap.set(r.id, r.name);
  }

  const totalDebt = Number(debtAggregate._sum.amount ?? 0);
  const paidThisMonth = Number(paidThisMonthAggregate._sum.amount ?? 0);
  const debtorsCount = counterpartiesWithDebt.length;

  const topDebts: DebtRow[] = topDebtsRaw
    .filter((r) => r.counterpartyId)
    .map((r) => ({
      counterpartyId: r.counterpartyId!,
      name: counterpartyMap.get(r.counterpartyId!) ?? "—",
      outstanding: Number(r._sum.amount ?? 0),
    }));

  const recentInvoices: RecentInvoice[] = recentInvoicesRaw.map((inv) => ({
    id: inv.id,
    title: inv.title,
    amount: Number(inv.amount),
    currency: inv.currency,
    occurredAt: inv.occurredAt,
    status: inv.status,
    counterpartyName: inv.counterpartyId
      ? counterpartyMap.get(inv.counterpartyId) ?? null
      : null,
    projectTitle: inv.project?.title ?? null,
  }));

  const pendingForemanReports: PendingForemanReport[] = pendingForemanReportsRaw.map(
    (r) => ({
      id: r.id,
      authorName: r.createdBy?.name ?? null,
      projectTitle: r.project?.title ?? null,
      submittedAt: r.submittedAt,
      itemsTotal: r.items.reduce((sum, it) => sum + Number(it.amount ?? 0), 0),
    }),
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <section
        className="rounded-2xl p-5 sm:p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            ФІНАНСИСТ · {today}
          </span>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Вітаю, {firstName}
          </h1>
          <p className="text-[14px]" style={{ color: T.textSecondary }}>
            {debtorsCount} постачальник{debtorsCount === 1 ? "" : "ів"} з боргом ·
            {" "}
            {formatCurrency(totalDebt)} загалом · {formatCurrency(paidThisMonth)} оплачено цього місяця
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin-v2/financing/suppliers?action=new-invoice"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Plus size={14} /> Додати накладну
          </Link>
          <Link
            href="/admin-v2/financing/suppliers?tab=payments"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <Wallet size={14} /> Журнал платежів
          </Link>
          <Link
            href="/admin-v2/foreman-reports"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <HardHat size={14} /> Заявки виконробів
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p
          className="px-1 text-[11px] font-bold tracking-widest"
          style={{ color: T.textMuted }}
        >
          ОБЛІК ПОСТАЧАЛЬНИКІВ
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="БОРГ ПОСТАЧАЛЬНИКАМ"
            value={formatCurrency(totalDebt)}
            sub={`${debtorsCount} постачальників`}
            icon={AlertTriangle}
            accent={totalDebt > 0 ? T.danger : T.textMuted}
            href="/admin-v2/financing/suppliers"
          />
          <KpiCard
            label="ОПЛАЧЕНО ЗА МІСЯЦЬ"
            value={formatCurrency(paidThisMonth)}
            sub="POSTED platежів"
            icon={Wallet}
            accent={T.success}
            href="/admin-v2/financing/suppliers?tab=payments"
          />
          <KpiCard
            label="ПОСТАЧАЛЬНИКИ"
            value={String(debtorsCount)}
            sub="з відкритим боргом"
            icon={Truck}
            accent={T.accentPrimary}
            href="/admin-v2/financing/suppliers"
          />
          <KpiCard
            label="ЗАЯВКИ ВИКОНРОБІВ"
            value={String(pendingForemanCount)}
            sub="чекають approve"
            icon={HardHat}
            accent={pendingForemanCount > 0 ? T.warning : T.textMuted}
            href="/admin-v2/foreman-reports"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Топ боргів
            </h3>
            <Link
              href="/admin-v2/financing/suppliers"
              className="text-[12px] font-semibold"
              style={{ color: T.accentPrimary }}
            >
              Усі →
            </Link>
          </div>
          {topDebts.length === 0 ? (
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              Немає відкритих боргів.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topDebts.map((d) => (
                <li
                  key={d.counterpartyId}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: T.panelSoft }}
                >
                  <Link
                    href={`/admin-v2/financing/suppliers?counterpartyId=${d.counterpartyId}`}
                    className="flex items-center gap-2 min-w-0"
                  >
                    <Building2 size={14} style={{ color: T.textMuted }} />
                    <span
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {d.name}
                    </span>
                  </Link>
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: T.danger }}
                  >
                    {formatCurrency(d.outstanding)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Останні накладні
            </h3>
            <Link
              href="/admin-v2/financing/suppliers"
              className="text-[12px] font-semibold"
              style={{ color: T.accentPrimary }}
            >
              Усі →
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-[13px]" style={{ color: T.textMuted }}>
              Накладних ще немає.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: T.panelSoft }}
                >
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[13px] font-semibold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {inv.title}
                    </span>
                    <span
                      className="text-[11px] truncate"
                      style={{ color: T.textMuted }}
                    >
                      {[
                        inv.counterpartyName,
                        inv.projectTitle,
                        inv.occurredAt.toLocaleDateString("uk-UA"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <span
                    className="text-[13px] font-semibold whitespace-nowrap"
                    style={{
                      color: inv.status === "PAID" ? T.success : T.warning,
                    }}
                  >
                    {formatCurrency(inv.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl p-5"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Заявки виконробів на approve
          </h3>
          <Link
            href="/admin-v2/foreman-reports"
            className="text-[12px] font-semibold"
            style={{ color: T.accentPrimary }}
          >
            Усі →
          </Link>
        </div>
        {pendingForemanReports.length === 0 ? (
          <p className="text-[13px]" style={{ color: T.textMuted }}>
            Немає заявок у черзі.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingForemanReports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{ backgroundColor: T.panelSoft }}
              >
                <Link
                  href={`/admin-v2/foreman-reports/${r.id}`}
                  className="flex flex-col min-w-0"
                >
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {r.authorName ?? "—"} · {r.projectTitle ?? "Без проєкту"}
                  </span>
                  <span
                    className="text-[11px] truncate"
                    style={{ color: T.textMuted }}
                  >
                    {r.submittedAt
                      ? `Подано ${r.submittedAt.toLocaleDateString("uk-UA")}`
                      : "Без дати подання"}
                  </span>
                </Link>
                <span
                  className="text-[13px] font-bold whitespace-nowrap"
                  style={{ color: T.warning }}
                >
                  {formatCurrency(r.itemsTotal)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="rounded-2xl p-5"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <div className="flex items-center gap-3">
          <ListTodo size={18} style={{ color: T.accentPrimary }} />
          <Link
            href="/admin-v2/me"
            className="text-[13px] font-semibold"
            style={{ color: T.textPrimary }}
          >
            Перейти у «Мої задачі»
          </Link>
          <span className="ml-auto">
            <Link
              href="/admin-v2/estimates"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <FileText size={14} /> Кошториси
            </Link>
          </span>
        </div>
      </section>
    </div>
  );
}
