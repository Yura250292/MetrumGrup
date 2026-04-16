import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { isTasksEnabledForProject } from "@/lib/tasks/feature-flag";

/**
 * GET /api/admin/me/projects
 *
 * Returns projects the current user can create tasks on, with their stages.
 * Used by the personal dashboard "New task" modal so the user can pick any
 * project they're a member of (not just SUPER_ADMIN/MANAGER access).
 *
 * Filters applied:
 *   - Tasks feature must be enabled for the project (or globally)
 *   - User must have canCreateTasks permission via ProjectMember or SUPER_ADMIN
 *   - CLIENT role returns empty array (tasks are internal-only)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ data: [] });
  }

  const uid = session.user.id;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  // Load all projects the user has any relationship with
  const rawProjects = await prisma.project.findMany({
    where: isSuperAdmin
      ? { status: { not: "CANCELLED" } }
      : {
          OR: [
            { managerId: uid },
            { members: { some: { userId: uid, isActive: true } } },
          ],
          status: { not: "CANCELLED" },
        },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, stage: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // Check tasks-enabled + canCreateTasks per project
  const results: Array<{
    id: string;
    title: string;
    status: string;
    currentStage: string;
    stages: { id: string; stage: string; status: string }[];
  }> = [];

  for (const p of rawProjects) {
    const enabled = await isTasksEnabledForProject(p.id);
    if (!enabled) continue;
    const ctx = await getProjectAccessContext(p.id, uid);
    if (!ctx?.canCreateTasks) continue;
    results.push({
      id: p.id,
      title: p.title,
      status: p.status,
      currentStage: p.currentStage,
      stages: p.stages,
    });
  }

  return NextResponse.json({ data: results });
}
