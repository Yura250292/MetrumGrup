import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";

async function auth403(projectId: string, userId: string) {
  const ctx = await getProjectAccessContext(projectId, userId);
  return !!ctx && (ctx.isSuperAdmin || ctx.member?.effective.canManageAutomations);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> },
) {
  const { id: projectId, automationId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await auth403(projectId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updated = await prisma.automation.update({
    where: { id: automationId },
    data: {
      name: typeof body.name === "string" ? body.name : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      conditionsJson: body.conditionsJson ?? undefined,
      actionsJson: body.actionsJson ?? undefined,
      triggerConfig: body.triggerConfig ?? undefined,
    },
  });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> },
) {
  const { id: projectId, automationId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!(await auth403(projectId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.automation.delete({ where: { id: automationId } });
  return NextResponse.json({ ok: true });
}
