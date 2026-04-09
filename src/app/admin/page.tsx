import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CompactStatsCard } from "@/components/dashboard/CompactStatsCard";
import { RecentlyCompletedWidget } from "@/components/dashboard/RecentlyCompletedWidget";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/lib/constants";
import {
  FolderKanban,
  Users,
  Calculator,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
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

  return (
    <div className="min-h-screen admin-dark:bg-black admin-light:bg-gray-50 pb-20 md:pb-6">
      {/* Mobile/Desktop Header */}
      <div className="admin-dark:bg-black admin-light:bg-gradient-to-r admin-light:from-blue-50 admin-light:via-blue-100 admin-light:to-cyan-50 border-b admin-dark:border-transparent admin-light:border-gray-200 md:px-10 md:py-6 px-6 py-6">
        <h1 className="text-3xl md:text-4xl font-bold admin-dark:text-white admin-light:text-blue-900">
          Вітаємо, Адміністратор!
        </h1>
        <p className="mt-1.5 text-base admin-dark:text-gray-400 admin-light:text-gray-600">
          Управління компанією
        </p>
      </div>

      {/* Content */}
      <div className="p-6 md:p-10 space-y-8">
        {/* Stats Grid - 2x2 на мобільному, 4 в ряд на десктопі */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {/* Projects Card */}
          <div className="admin-dark:bg-gradient-to-br admin-dark:from-blue-500 admin-dark:to-cyan-500 admin-light:bg-gradient-to-br admin-light:from-blue-500 admin-light:to-cyan-500 rounded-2xl p-6 shadow-xl admin-dark:shadow-blue-500/20 admin-light:shadow-blue-500/20">
            <FolderKanban className="h-10 w-10 text-white mb-4" />
            <p className="text-5xl font-bold text-white mb-2">{projectsCount}</p>
            <p className="text-sm font-semibold text-blue-100 mb-1">Проєкти</p>
            <p className="text-xs text-blue-200">{activeProjectsCount} активних</p>
          </div>

          {/* Clients Card */}
          <div className="admin-dark:bg-gradient-to-br admin-dark:from-green-500 admin-dark:to-emerald-600 admin-light:bg-gradient-to-br admin-light:from-green-500 admin-light:to-emerald-600 rounded-2xl p-6 shadow-xl admin-dark:shadow-green-500/20 admin-light:shadow-green-500/20">
            <Users className="h-10 w-10 text-white mb-4" />
            <p className="text-5xl font-bold text-white mb-2">{clientsCount}</p>
            <p className="text-sm font-semibold text-green-100 mb-1">Клієнти</p>
            <p className="text-xs text-green-200">активних облікових записів</p>
          </div>

          {/* Estimates Card */}
          <div className="admin-dark:bg-gradient-to-br admin-dark:from-amber-500 admin-dark:to-yellow-500 admin-light:bg-gradient-to-br admin-light:from-amber-500 admin-light:to-yellow-500 rounded-2xl p-6 shadow-xl admin-dark:shadow-amber-500/20 admin-light:shadow-amber-500/20">
            <Calculator className="h-10 w-10 text-white mb-4" />
            <p className="text-5xl font-bold text-white mb-2">{estimatesCount}</p>
            <p className="text-sm font-semibold text-amber-100 mb-1">Кошториси</p>
            <p className="text-xs text-amber-200">створено</p>
          </div>

          {/* Revenue Card */}
          <div className="admin-dark:bg-gradient-to-br admin-dark:from-purple-600 admin-dark:to-indigo-600 admin-light:bg-gradient-to-br admin-light:from-purple-600 admin-light:to-indigo-600 rounded-2xl p-6 shadow-xl admin-dark:shadow-purple-600/20 admin-light:shadow-purple-600/20">
            <TrendingUp className="h-10 w-10 text-white mb-4" />
            <p className="text-4xl md:text-5xl font-bold text-white mb-2">{formatCurrency(revenue)}</p>
            <p className="text-sm font-semibold text-purple-100 mb-1">Дохід</p>
            <p className="text-xs text-purple-200">сплачено</p>
          </div>
        </div>

        {/* Recent Projects */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold admin-dark:text-white admin-light:text-gray-900">Останні проєкти</h2>
            <Link
              href="/admin/projects"
              className="flex items-center gap-1 text-sm font-medium admin-dark:text-blue-400 admin-dark:hover:text-blue-300 admin-light:text-blue-600 admin-light:hover:text-blue-700 transition-colors"
            >
              Всі <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-xl border admin-dark:border-gray-800 admin-dark:bg-glass-dark admin-light:border-gray-200 admin-light:bg-white backdrop-blur-md overflow-hidden admin-light:shadow-md">
            {recentProjects.length > 0 ? (
              <div className="divide-y admin-dark:divide-gray-800 admin-light:divide-gray-100">
                {recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className="flex items-center justify-between px-4 py-4 admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-base font-semibold admin-dark:text-white admin-light:text-gray-900 mb-1 leading-tight">{project.title}</p>
                      <p className="text-sm admin-dark:text-gray-400 admin-light:text-gray-600 leading-tight">
                        {project.client.name}
                      </p>
                      {project.manager && (
                        <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500 mt-0.5">
                          Менеджер: {project.manager.name}
                        </p>
                      )}
                    </div>
                    <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm admin-dark:text-gray-400 admin-light:text-gray-500">
                Немає проєктів
              </p>
            )}
          </div>
        </div>

        {/* Recently Completed Widget */}
        <RecentlyCompletedWidget />

        {/* Overdue Payments */}
        {overduePayments.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <AlertCircle className="h-5 w-5 admin-dark:text-red-400 admin-light:text-red-600" />
              <h2 className="text-lg font-bold admin-dark:text-white admin-light:text-gray-900">Прострочені платежі</h2>
            </div>

            <div className="rounded-xl border admin-dark:border-red-500/20 admin-dark:bg-glass-dark admin-light:border-red-200 admin-light:bg-red-50 backdrop-blur-md overflow-hidden admin-light:shadow-md">
              <div className="divide-y admin-dark:divide-gray-800 admin-light:divide-red-100">
                {overduePayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between px-4 py-4">
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-base font-semibold admin-dark:text-white admin-light:text-gray-900 mb-1 leading-tight">
                        {payment.project.title}
                      </p>
                      <p className="text-sm admin-dark:text-gray-400 admin-light:text-gray-600 leading-tight">
                        Дата: {formatDateShort(payment.scheduledDate)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold admin-dark:text-red-400 admin-light:text-red-600 mb-0.5">
                        {formatCurrency(Number(payment.amount))}
                      </p>
                      <span className="text-xs font-medium admin-dark:text-red-500 admin-light:text-red-700">Прострочено</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
