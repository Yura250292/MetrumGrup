import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  addProjectMember,
  listAllMembers,
} from "@/lib/projects/members-service";
import { canManageProjectMembers } from "@/lib/projects/access";
import { auditLog } from "@/lib/audit";
import { notifyProjectMembers } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@prisma/client";

const VALID_ROLES: ProjectRole[] = [
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "ENGINEER",
  "FOREMAN",
  "FINANCE",
  "PROCUREMENT",
  "VIEWER",
];

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[projects/members] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const allowed = await canManageProjectMembers(id, session.user.id);
    if (!allowed) return forbiddenResponse();
    const members = await listAllMembers(id);
    return NextResponse.json({ members });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;
    const allowed = await canManageProjectMembers(id, session.user.id);
    if (!allowed) return forbiddenResponse();

    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : null;
    const employeeId =
      typeof body.employeeId === "string" ? body.employeeId : null;
    const roleInProject =
      typeof body.roleInProject === "string"
        ? (body.roleInProject as ProjectRole)
        : null;

    if ((!userId && !employeeId) || !roleInProject || !VALID_ROLES.includes(roleInProject)) {
      return NextResponse.json(
        { error: "Поля 'userId' або 'employeeId' та 'roleInProject' обов'язкові" },
        { status: 400 },
      );
    }
    if (userId && employeeId) {
      return NextResponse.json(
        { error: "Можна передати лише одне з userId / employeeId" },
        { status: 400 },
      );
    }

    const member = await addProjectMember({
      projectId: id,
      ...(userId ? { userId } : { employeeId: employeeId! }),
      roleInProject,
      invitedById: session.user.id,
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "ProjectMember",
      entityId: member.id,
      projectId: id,
      newData: { userId, employeeId, roleInProject },
    });

    // Notify: personal "you were added" for the new member, and broadcast
    // "X joined" to other active members. Employee-без-User notifications skip.
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { title: true },
      });
      const projectTitle = project?.title ?? "";
      const memberName =
        member.user?.name ?? member.employee?.fullName ?? "Учасник";

      // Personal notification — лише для User.
      if (userId && userId !== session.user.id) {
        await prisma.notification.create({
          data: {
            userId,
            type: "PROJECT_MEMBER_ADDED",
            title: `Вас додано до проєкту «${projectTitle}»`,
            body: `Роль: ${roleInProject}`,
            relatedEntity: "Project",
            relatedId: id,
          },
        });
      }

      // Broadcast — exclude actor + new member (якщо User).
      await notifyProjectMembers({
        projectId: id,
        actorId: session.user.id,
        type: "PROJECT_MEMBER_ADDED",
        title: `Новий учасник у проєкті «${projectTitle}»`,
        body: `${memberName} (${roleInProject})`,
        relatedEntity: "Project",
        relatedId: id,
        excludeUserIds: userId ? [userId] : [],
      });
    } catch (err) {
      console.error("[projects/members] notifyProjectMembers failed:", err);
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
