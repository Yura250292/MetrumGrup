import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from "@/lib/constants";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  Clock,
  AlertCircle,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardFinancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { clientId: session.user.id },
    select: {
      id: true,
      title: true,
      totalBudget: true,
      totalPaid: true,
      status: true,
    },
    orderBy: { title: "asc" },
  });

  const payments = await prisma.payment.findMany({
    where: { project: { clientId: session.user.id } },
    include: { project: { select: { id: true, title: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  // Aggregated stats
  const totalBudget = projects.reduce((s, p) => s + Number(p.totalBudget), 0);
  const totalPaid = projects.reduce((s, p) => s + Number(p.totalPaid), 0);
  const totalRemaining = totalBudget - totalPaid;
  const percentage = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

  // Upcoming payments
  const now = new Date();
  const upcoming = payments.filter(
    (p) => p.status !== "PAID" && new Date(p.scheduledDate) >= now
  );
  const overdue = payments.filter(
    (p) => p.status !== "PAID" && new Date(p.scheduledDate) < now
  );
  const paid = payments.filter((p) => p.status === "PAID");

  return (
    <div className="pb-4 md:pb-6">
      {/* Header — desktop only */}
      <div className="hidden md:block -mx-8 -mt-8 mb-6 px-8 py-6 admin-dark:bg-gradient-to-r admin-dark:from-gray-800 admin-dark:via-gray-900 admin-dark:to-black admin-light:bg-gradient-to-r admin-light:from-blue-50 admin-light:via-white admin-light:to-green-50 border-b admin-dark:border-white/10 admin-light:border-gray-200 transition-colors">
        <h1 className="text-2xl font-bold admin-dark:text-white admin-light:text-gray-900">
          Фінанси
        </h1>
        <p className="mt-1 text-sm admin-dark:text-gray-400 admin-light:text-gray-600">
          Платежі та бюджет по всіх проєктах
        </p>
      </div>

      <div className="space-y-4">
        {/* Overall progress */}
        <Card className="p-5 admin-dark:bg-gray-900/50 admin-dark:border-white/10 admin-light:shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold admin-dark:text-white admin-light:text-gray-900">
              Загальна оплата
            </span>
            <span className="text-2xl font-bold admin-dark:text-blue-400 admin-light:text-primary">
              {percentage}%
            </span>
          </div>
          <Progress
            value={percentage}
            className="h-3"
            indicatorClassName="bg-gradient-to-r from-blue-500 to-green-500"
          />
          <div className="mt-2 flex justify-between text-xs admin-dark:text-gray-400 admin-light:text-muted-foreground">
            <span>Сплачено: {formatCurrency(totalPaid)}</span>
            <span>Всього: {formatCurrency(totalBudget)}</span>
          </div>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            icon={Wallet}
            label="Бюджет"
            value={formatCurrency(totalBudget)}
            color="blue"
          />
          <KpiCard
            icon={TrendingUp}
            label="Сплачено"
            value={formatCurrency(totalPaid)}
            color="green"
          />
          <KpiCard
            icon={Clock}
            label="Залишок"
            value={formatCurrency(totalRemaining)}
            color="amber"
          />
        </div>

        {/* Overdue alert */}
        {overdue.length > 0 && (
          <Card className="p-4 border-l-4 border-l-red-500 admin-dark:bg-red-950/30 admin-dark:border-white/10 admin-light:bg-red-50 admin-light:shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold admin-dark:text-red-300 admin-light:text-red-700">
                  {overdue.length} прострочен{overdue.length === 1 ? "ий" : "их"} плат{overdue.length === 1 ? "іж" : "ежів"}
                </p>
                <p className="text-xs admin-dark:text-red-400/70 admin-light:text-red-600">
                  На суму {formatCurrency(overdue.reduce((s, p) => s + Number(p.amount), 0))}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Upcoming payments */}
        <div>
          <h2 className="text-base font-bold mb-3 px-1 admin-dark:text-white admin-light:text-gray-900">
            <CalendarDays className="inline h-4 w-4 mr-1.5 admin-dark:text-gray-400 admin-light:text-gray-500" />
            Найближчі платежі
          </h2>
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.slice(0, 5).map((payment) => (
                <Link
                  key={payment.id}
                  href={`/dashboard/projects/${payment.project.id}/finances`}
                >
                  <Card className="p-4 admin-dark:bg-gray-900/50 admin-dark:border-white/10 admin-dark:hover:bg-gray-800/50 admin-light:hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                            {formatCurrency(Number(payment.amount))}
                          </span>
                          <Badge className={PAYMENT_STATUS_COLORS[payment.status]}>
                            {PAYMENT_STATUS_LABELS[payment.status]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs admin-dark:text-gray-400 admin-light:text-muted-foreground">
                          <span>{formatDateShort(payment.scheduledDate)}</span>
                          <span>·</span>
                          <span className="truncate">{payment.project.title}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 admin-dark:text-gray-600 admin-light:text-gray-400" />
                    </div>
                  </Card>
                </Link>
              ))}
              {upcoming.length > 5 && (
                <p className="text-center text-xs admin-dark:text-gray-500 admin-light:text-muted-foreground py-2">
                  + ще {upcoming.length - 5} платежів
                </p>
              )}
            </div>
          ) : (
            <Card className="p-8 text-center admin-dark:bg-gray-900/50 admin-dark:border-white/10">
              <CheckCircle2 className="mx-auto h-8 w-8 admin-dark:text-green-500/60 admin-light:text-green-500" />
              <p className="mt-2 text-sm admin-dark:text-gray-400 admin-light:text-muted-foreground">
                Немає запланованих платежів
              </p>
            </Card>
          )}
        </div>

        {/* Per-project breakdown */}
        <div>
          <h2 className="text-base font-bold mb-3 px-1 admin-dark:text-white admin-light:text-gray-900">
            По проєктах
          </h2>
          <div className="space-y-2">
            {projects.map((project) => {
              const budget = Number(project.totalBudget);
              const paidAmount = Number(project.totalPaid);
              const remaining = budget - paidAmount;
              const pct = budget > 0 ? Math.round((paidAmount / budget) * 100) : 0;
              const projectPayments = payments.filter((p) => p.project.id === project.id);
              const projectOverdue = projectPayments.filter(
                (p) => p.status !== "PAID" && new Date(p.scheduledDate) < now
              );

              return (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}/finances`}
                >
                  <Card className="p-4 admin-dark:bg-gray-900/50 admin-dark:border-white/10 admin-dark:hover:bg-gray-800/50 admin-light:hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                        {project.title}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {projectOverdue.length > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                            {projectOverdue.length}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 admin-dark:text-gray-600 admin-light:text-gray-400" />
                      </div>
                    </div>
                    <Progress
                      value={pct}
                      className="h-1.5 mb-2"
                      indicatorClassName="bg-gradient-to-r from-blue-500 to-green-500"
                    />
                    <div className="flex justify-between text-xs admin-dark:text-gray-400 admin-light:text-muted-foreground">
                      <span>Сплачено: {formatCurrency(paidAmount)}</span>
                      <span>Залишок: {formatCurrency(remaining)}</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent payments */}
        {paid.length > 0 && (
          <div>
            <h2 className="text-base font-bold mb-3 px-1 admin-dark:text-white admin-light:text-gray-900">
              <CheckCircle2 className="inline h-4 w-4 mr-1.5 text-green-500" />
              Останні оплати
            </h2>
            <div className="space-y-2">
              {paid.slice(-5).reverse().map((payment) => (
                <Card
                  key={payment.id}
                  className="p-3 admin-dark:bg-gray-900/30 admin-dark:border-white/5 admin-light:bg-green-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold admin-dark:text-white admin-light:text-gray-900">
                        {formatCurrency(Number(payment.amount))}
                      </span>
                      <div className="text-xs admin-dark:text-gray-500 admin-light:text-muted-foreground">
                        {payment.paidDate ? formatDateShort(payment.paidDate) : formatDateShort(payment.scheduledDate)}
                        {" · "}
                        {payment.project.title}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: "blue" | "green" | "amber";
}) {
  const colors = {
    blue: {
      bg: "admin-dark:bg-blue-500/10 admin-light:bg-blue-50",
      icon: "text-blue-500",
      text: "admin-dark:text-blue-400 admin-light:text-blue-600",
    },
    green: {
      bg: "admin-dark:bg-green-500/10 admin-light:bg-green-50",
      icon: "text-green-500",
      text: "admin-dark:text-green-400 admin-light:text-green-600",
    },
    amber: {
      bg: "admin-dark:bg-amber-500/10 admin-light:bg-amber-50",
      icon: "text-amber-500",
      text: "admin-dark:text-amber-400 admin-light:text-amber-600",
    },
  };

  const c = colors[color];

  return (
    <Card className="p-3 admin-dark:bg-gray-900/50 admin-dark:border-white/10 admin-light:shadow-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg mb-2 ${c.bg}`}>
        <Icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <p className="text-[10px] admin-dark:text-gray-500 admin-light:text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold truncate ${c.text}`}>{value}</p>
    </Card>
  );
}
