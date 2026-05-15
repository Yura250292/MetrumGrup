import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  changeMemberRole,
  deactivateMember,
} from "@/lib/projects/members-service";
import { canManageProjectMembers } from "@/lib/projects/access";
import { auditLog } from "@/lib/audit";
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
  console.error("[projects/members/:memberId] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

async function loadMember(memberId: string) {
  return prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { id: true, projectId: true, userId: true, roleInProject: true },
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id, memberId } = await ctx.params;
    const allowed = await canManageProjectMembers(id, session.user.id);
    if (!allowed) return forbiddenResponse();

    const member = await loadMember(memberId);
    if (!member || member.projectId !== id) {
      return NextResponse.json({ error: "Учасника не знайдено" }, { status: 404 });
    }

    const body = await request.json();
    const roleInProject =
      typeof body.roleInProject === "string" ? (body.roleInProject as ProjectRole) : null;
    if (!roleInProject || !VALID_ROLES.includes(roleInProject)) {
      return NextResponse.json({ error: "Невірна роль" }, { status: 400 });
    }

    const updated = await changeMemberRole(id, member.userId, roleInProject);

    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "ProjectMember",
      entityId: memberId,
      projectId: id,
      oldData: { roleInProject: member.roleInProject },
      newData: { roleInProject },
    });

    return NextResponse.json({ member: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id, memberId } = await ctx.params;
    const allowed = await canManageProjectMembers(id, session.user.id);
    if (!allowed) return forbiddenResponse();

    const member = await loadMember(memberId);
    if (!member || member.projectId !== id) {
      return NextResponse.json({ error: "Учасника не знайдено" }, { status: 404 });
    }

    await deactivateMember(id, member.userId);

    await auditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "ProjectMember",
      entityId: memberId,
      projectId: id,
      oldData: { userId: member.userId, roleInProject: member.roleInProject },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
