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
    const roleInProject =
      typeof body.roleInProject === "string" ? (body.roleInProject as ProjectRole) : null;

    if (!userId || !roleInProject || !VALID_ROLES.includes(roleInProject)) {
      return NextResponse.json(
        { error: "Поля 'userId' та 'roleInProject' обов'язкові" },
        { status: 400 },
      );
    }

    const member = await addProjectMember({
      projectId: id,
      userId,
      roleInProject,
      invitedById: session.user.id,
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "ProjectMember",
      entityId: member.id,
      projectId: id,
      newData: { userId, roleInProject },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
