import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Foreman diagnostics — повертає що бачить сервер про залогіненого foreman'а:
 * session, resolved firm, role, membership count, projects.
 * Призначений для відладки коли foreman бачить «Немає призначень»
 * хоча менеджер додав його у команду.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, reason: "no-session" }, { status: 401 });
  }

  const scope = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, scope.firmId);

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session.user.id, isActive: true },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          status: true,
          firmId: true,
          folderId: true,
        },
      },
    },
  });

  const foremanMemberships = memberships.filter((m) => m.roleInProject === "FOREMAN");

  return NextResponse.json({
    ok: true,
    session: {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      baseRole: session.user.role,
      homeFirmId: session.user.firmId ?? null,
      firmAccess: session.user.firmAccess ?? {},
    },
    resolvedScope: {
      activeFirmId: scope.firmId,
      userFirmId: scope.userFirmId,
      isSuperAdmin: scope.isSuperAdmin,
      activeRole,
    },
    memberships: {
      total: memberships.length,
      foreman: foremanMemberships.length,
      details: memberships.map((m) => ({
        projectId: m.projectId,
        projectTitle: m.project.title,
        projectFirmId: m.project.firmId,
        projectStatus: m.project.status,
        roleInProject: m.roleInProject,
        isActive: m.isActive,
      })),
    },
  });
}
