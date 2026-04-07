import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CompactStatsCard } from "@/components/dashboard/CompactStatsCard";
import { CompactProjectCard } from "@/components/dashboard/CompactProjectCard";
import { formatCurrency } from "@/lib/utils";
import { FolderKanban, Wallet, Clock } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { clientId: session.user.id },
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const totalPaid = projects.reduce((sum, p) => sum + Number(p.totalPaid), 0);
  const totalRemaining = projects.reduce(
    (sum, p) => sum + (Number(p.totalBudget) - Number(p.totalPaid)),
    0
  );

  // Find next upcoming payment
  const nextPayment = await prisma.payment.findFirst({
    where: {
      project: { clientId: session.user.id },
      status: { in: ["PENDING", "PARTIAL"] },
      scheduledDate: { gte: new Date() },
    },
    orderBy: { scheduledDate: "asc" },
  });

  return (
    <div className="min-h-screen admin-dark:bg-[#0F0F0F] admin-light:bg-gray-50 pb-20 md:pb-6 transition-colors">
      {/* Header with gradient */}
      <div className="admin-dark:bg-gradient-to-r admin-dark:from-gray-800 admin-dark:via-gray-900 admin-dark:to-black admin-dark:border-white/10 admin-dark:shadow-neon-top admin-light:bg-gradient-to-r admin-light:from-blue-50 admin-light:via-white admin-light:to-green-50 border-b admin-light:border-gray-200 admin-light:shadow-sm transition-colors">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold admin-dark:text-white admin-light:text-gray-900">
            Вітаємо, {session.user.name?.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm admin-dark:text-gray-400 admin-light:text-gray-600">
            Огляд ваших проєктів
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Stats Grid - 2 колонки на мобільному */}
        <div className="grid grid-cols-2 gap-3">
          <CompactStatsCard
            title="Активні"
            value={String(activeProjects.length)}
            description={`з ${projects.length} загалом`}
            icon={FolderKanban}
            variant="blue"
          />
          <CompactStatsCard
            title="Сплачено"
            value={formatCurrency(totalPaid)}
            icon={Wallet}
            variant="green"
          />
        </div>

        {/* Wide Stats Card */}
        <CompactStatsCard
          title="Залишок до сплати"
          value={formatCurrency(totalRemaining)}
          description={
            nextPayment
              ? `Наступний платіж: ${formatCurrency(Number(nextPayment.amount))}`
              : undefined
          }
          icon={Clock}
          variant="gray"
          className="col-span-2"
        />

        {/* Projects Section */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-bold admin-dark:text-white admin-light:text-gray-900">Ваші проєкти</h2>
            <span className="text-sm font-medium admin-dark:text-gray-400 admin-light:text-gray-600">{projects.length}</span>
          </div>

          {projects.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {projects.map((project, index) => {
                // Calculate progress from stages
                const completedStages = project.stages.filter(
                  (s) => s.status === "COMPLETED"
                ).length;
                const totalStages = project.stages.length;
                const progress = totalStages > 0
                  ? Math.round((completedStages / totalStages) * 100)
                  : 0;

                return (
                  <CompactProjectCard
                    key={project.id}
                    id={project.id}
                    title={project.title}
                    address={project.address || "—"}
                    status={project.status}
                    progress={progress}
                    variant={index % 2 === 0 ? "blue" : "amber"}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border admin-dark:border-gray-800 admin-dark:bg-glass-dark admin-light:border-gray-200 admin-light:bg-white backdrop-blur-md p-12 text-center admin-light:shadow-md transition-colors">
              <FolderKanban className="mx-auto h-12 w-12 admin-dark:text-gray-600 admin-light:text-gray-400" />
              <h3 className="mt-4 text-lg font-medium admin-dark:text-white admin-light:text-gray-900">Немає проєктів</h3>
              <p className="mt-1 text-sm admin-dark:text-gray-400 admin-light:text-gray-600">
                Ваші проєкти з&apos;являться тут після створення менеджером.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
