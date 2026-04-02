import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProjectsDashboardTable } from "@/components/admin/ProjectsDashboardTable";

export const dynamic = 'force-dynamic';

export default async function ProjectsDashboardPage() {
  const session = await auth();

  // Authorization
  if (!session?.user) redirect("/login");
  if (!["SUPER_ADMIN", "MANAGER"].includes(session.user.role)) {
    redirect("/admin");
  }

  // Fetch all necessary data
  const [projects, managers] = await Promise.all([
    prisma.project.findMany({
      include: {
        client: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        crewAssignments: {
          where: { endDate: null },
          include: {
            worker: {
              select: { id: true, name: true, specialty: true }
            }
          },
          orderBy: { startDate: 'desc' }
        },
        estimates: {
          where: {
            status: { in: ['APPROVED', 'SENT', 'FINANCE_REVIEW', 'ENGINEER_REVIEW'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            number: true,
            finalAmount: true,
            status: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            estimates: true,
            crewAssignments: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    }),
    // Get managers for filter dropdown
    prisma.user.findMany({
      where: { role: "MANAGER" },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Дашборд проєктів</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Управління проєктами, бригадами та кошторисами
        </p>
      </div>

      <ProjectsDashboardTable
        projects={projects}
        managers={managers}
      />
    </div>
  );
}
