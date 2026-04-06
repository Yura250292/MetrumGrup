import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { formatCurrency } from "@/lib/utils";
import { FolderKanban, Wallet, Clock } from "lucide-react";
import type { ProjectWithStages } from "@/types";

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
    <div>
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold">
          Вітаємо, {session.user.name?.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-xs md:text-sm text-muted-foreground">
          Огляд ваших проєктів
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 md:mb-8 grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
        <StatsCard
          title="Активні проєкти"
          value={String(activeProjects.length)}
          description={`з ${projects.length} загалом`}
          icon={FolderKanban}
        />
        <StatsCard
          title="Загально сплачено"
          value={formatCurrency(totalPaid)}
          icon={Wallet}
        />
        <StatsCard
          title="Залишок до сплати"
          value={formatCurrency(totalRemaining)}
          description={
            nextPayment
              ? `Наступний платіж: ${formatCurrency(Number(nextPayment.amount))}`
              : undefined
          }
          icon={Clock}
        />
      </div>

      {/* Projects */}
      {projects.length > 0 ? (
        <div>
          <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold">Ваші проєкти</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {(projects as ProjectWithStages[]).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає проєктів</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ваші проєкти з&apos;являться тут після створення менеджером.
          </p>
        </div>
      )}
    </div>
  );
}
