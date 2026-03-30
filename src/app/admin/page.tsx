import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Огляд активності компанії
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Всього проєктів</p>
              <p className="mt-1 text-3xl font-bold">{projectsCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeProjectsCount} активних
              </p>
            </div>
            <div className="rounded-lg bg-blue-100 p-2.5">
              <FolderKanban className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Клієнти</p>
              <p className="mt-1 text-3xl font-bold">{clientsCount}</p>
            </div>
            <div className="rounded-lg bg-purple-100 p-2.5">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Кошториси</p>
              <p className="mt-1 text-3xl font-bold">{estimatesCount}</p>
            </div>
            <div className="rounded-lg bg-orange-100 p-2.5">
              <Calculator className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Дохід (оплати)</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(revenue)}</p>
            </div>
            <div className="rounded-lg bg-green-100 p-2.5">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Projects */}
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-semibold">Останні проєкти</h2>
            <Link
              href="/admin/projects"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Всі <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{project.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.client.name}
                    {project.manager && ` • ${project.manager.name}`}
                  </p>
                </div>
                <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
              </Link>
            ))}
            {recentProjects.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Немає проєктів
              </p>
            )}
          </div>
        </Card>

        {/* Overdue Payments */}
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Прострочені платежі
            </h2>
          </div>
          <div className="divide-y">
            {overduePayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {payment.project.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Дата: {formatDateShort(payment.scheduledDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-destructive">
                    {formatCurrency(Number(payment.amount))}
                  </p>
                  <Badge variant="destructive" className="text-[10px]">
                    Прострочено
                  </Badge>
                </div>
              </div>
            ))}
            {overduePayments.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Немає прострочених платежів
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
