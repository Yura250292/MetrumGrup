import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import type { ProjectWithStages } from "@/types";

export const dynamic = 'force-dynamic';

export default async function ProjectsListPage() {
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Мої проєкти</h1>

      {projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(projects as ProjectWithStages[]).map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            У вас поки немає проєктів.
          </p>
        </div>
      )}
    </div>
  );
}
