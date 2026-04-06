import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CompactStatsCard } from "@/components/dashboard/CompactStatsCard";
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
    <div className="min-h-screen bg-[#0F0F0F] pb-6">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-black border-b border-white/10 shadow-neon-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-white">
            🎨 Дашборд
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Огляд активності компанії
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Stats Grid - 2x2 на мобільному */}
        <div className="grid grid-cols-2 gap-3">
          <CompactStatsCard
            title="Проєкти"
            value={String(projectsCount)}
            description={`${activeProjectsCount} активних`}
            icon={FolderKanban}
            variant="blue"
          />
          <CompactStatsCard
            title="Клієнти"
            value={String(clientsCount)}
            icon={Users}
            variant="green"
          />
          <CompactStatsCard
            title="Кошториси"
            value={String(estimatesCount)}
            icon={Calculator}
            variant="gray"
          />
          <CompactStatsCard
            title="Дохід"
            value={formatCurrency(revenue)}
            description="сплачено"
            icon={TrendingUp}
            variant="green"
          />
        </div>

        {/* Recent Projects */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Останні проєкти</h2>
            <Link
              href="/admin/projects"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              Всі <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-gray-800 bg-glass-dark backdrop-blur-md overflow-hidden">
            {recentProjects.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{project.title}</p>
                      <p className="text-xs text-gray-400">
                        {project.client.name}
                        {project.manager && ` • ${project.manager.name}`}
                      </p>
                    </div>
                    <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                Немає проєктів
              </p>
            )}
          </div>
        </div>

        {/* Overdue Payments */}
        {overduePayments.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <h2 className="text-base font-semibold text-white">Прострочені платежі</h2>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-glass-dark backdrop-blur-md overflow-hidden">
              <div className="divide-y divide-gray-800">
                {overduePayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {payment.project.title}
                      </p>
                      <p className="text-xs text-gray-400">
                        Дата: {formatDateShort(payment.scheduledDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-400">
                        {formatCurrency(Number(payment.amount))}
                      </p>
                      <span className="text-[10px] text-red-500">Прострочено</span>
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
