import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import {
  enableTasksGlobally,
  isTasksEnabledForProject,
  isTasksEnabledGlobally,
} from "@/lib/tasks/feature-flag";

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
 *
 * Bootstrap: on first SUPER_ADMIN access when no feature flag exists,
 * auto-enable globally. This removes the manual "go to Prisma Studio and
 * insert a Setting row" step — admins can just start using tasks.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ data: [] });
  }

  const uid = session.user.id;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  // Auto-bootstrap: enable flag on first SUPER_ADMIN/MANAGER hit if it's still off.
  // Avoids the manual "insert a Setting row" step for the default admin flow.
  if (isSuperAdmin || session.user.role === "MANAGER") {
    const enabled = await isTasksEnabledGlobally();
    if (!enabled) {
      await enableTasksGlobally();
    }
  }

  // Load all projects the user has any relationship with
  const rawProjects = await prisma.project.findMany({
    where: isSuperAdmin
      ? { status: { not: "CANCELLED" } }
      : {
          OR: [
            { managerId: uid },
            { members: { some: { userId: uid, isActive: true } } },
            { isInternal: true },
          ],
          status: { not: "CANCELLED" },
        },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      isInternal: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, stage: true, status: true },
      },
    },
    orderBy: [{ isInternal: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });

  // Check tasks-enabled + canCreateTasks per project
  const results: Array<{
    id: string;
    title: string;
    status: string;
    currentStage: string;
    isInternal: boolean;
    stages: { id: string; stage: string; status: string }[];
  }> = [];

  for (const p of rawProjects) {
    // Internal projects are always accessible for task creation
    if (p.isInternal) {
      results.push({
        id: p.id,
        title: p.title,
        status: p.status,
        currentStage: p.currentStage,
        isInternal: true,
        stages: p.stages,
      });
      continue;
    }
    const enabled = await isTasksEnabledForProject(p.id);
    if (!enabled) continue;
    const ctx = await getProjectAccessContext(p.id, uid);
    if (!ctx?.canCreateTasks) continue;
    results.push({
      id: p.id,
      title: p.title,
      status: p.status,
      currentStage: p.currentStage,
      isInternal: false,
      stages: p.stages,
    });
  }

  return NextResponse.json({ data: results });
}
