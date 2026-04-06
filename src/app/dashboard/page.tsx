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
    <div className="min-h-screen bg-[#0F0F0F] pb-20 md:pb-6">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-black border-b border-white/10 shadow-neon-top">
        <div className="px-4 py-4">
          <div className="mb-2 p-2 bg-red-500 text-white text-center font-bold rounded">
            ⚠️ ТЕСТ: Якщо бачите це - новий дизайн працює!
          </div>
          <h1 className="text-2xl font-bold text-white">
            🎨 Новий дизайн! Вітаємо, {session.user.name?.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm text-gray-400">
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Ваші проєкти</h2>
            <span className="text-sm text-gray-400">{projects.length}</span>
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
            <div className="rounded-xl border border-gray-800 bg-glass-dark backdrop-blur-md p-12 text-center">
              <FolderKanban className="mx-auto h-12 w-12 text-gray-600" />
              <h3 className="mt-4 text-lg font-medium text-white">Немає проєктів</h3>
              <p className="mt-1 text-sm text-gray-400">
                Ваші проєкти з&apos;являться тут після створення менеджером.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
